"use client"
import { create } from "zustand"
import { v4 as uuid } from "uuid"
import { toast } from "sonner"
import type { Installments, Transaction } from "@/lib/types"

/** `installments: null` quita el plan de cuotas (vuelve a una cuota). */
export type TransactionPatch = Partial<Omit<Transaction, "installments">> & {
  installments?: Installments | null
}

function applyPatch(tx: Transaction, patch: TransactionPatch): Transaction {
  const { installments, ...rest } = patch
  const next: Transaction = { ...tx, ...rest }
  if (installments) next.installments = installments
  else if (installments === null) delete next.installments
  return next
}
import { normalizeTransaction } from "@/lib/finance/transactions"

const EMPTY_TXS: Transaction[] = []

function buildIndex(txs: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const list = map.get(tx.accountId)
    if (list) {
      list.push(tx)
    } else {
      map.set(tx.accountId, [tx])
    }
  }
  return map
}

interface State {
  transactions: Transaction[]
  txsByAccountId: Map<string, Transaction[]>
  loaded: boolean
  isHydrating: boolean
  seed: (transactions: Transaction[]) => void
  hydrate: () => Promise<void>
  refresh: () => Promise<void>
  /** Merges movements created elsewhere (e.g. Apple Pay). Returns how many arrived. */
  pullNew: () => Promise<number>
  add: (data: Omit<Transaction, "id">) => Promise<Transaction | null>
  addMany: (data: Omit<Transaction, "id">[]) => Promise<Transaction[]>
  update: (id: string, patch: TransactionPatch) => Promise<void>
  remove: (id: string) => Promise<void>
  forAccount: (accountId: string) => Transaction[]
}

export const useTransactionsStore = create<State>()((set, get) => ({
  transactions: [],
  txsByAccountId: new Map(),
  loaded: false,
  isHydrating: false,
  seed: (transactions) => {
    // Server-prefetched data: skip if the client already loaded fresher state.
    if (get().loaded) return
    const normalized = transactions.map(normalizeTransaction)
    set({
      transactions: normalized,
      txsByAccountId: buildIndex(normalized),
      loaded: true,
    })
  },
  hydrate: async () => {
    const { loaded, isHydrating } = get()
    if (loaded || isHydrating) return
    set({ isHydrating: true })
    try {
      const res = await fetch("/api/transactions", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const transactions = ((await res.json()) as Transaction[]).map(
        normalizeTransaction
      )
      set({
        transactions,
        txsByAccountId: buildIndex(transactions),
        loaded: true,
        isHydrating: false,
      })
    } catch {
      // DB unreachable: don't crash the app — leave state empty and allow a retry.
      set({ isHydrating: false })
    }
  },
  refresh: async () => {
    set({ loaded: false, isHydrating: false })
    await get().hydrate()
  },
  pullNew: async () => {
    if (!get().loaded) return 0
    try {
      const res = await fetch("/api/transactions", { cache: "no-store" })
      if (!res.ok) return 0
      const server = ((await res.json()) as Transaction[]).map(normalizeTransaction)
      let added: Transaction[] = []
      // Only append unknown ids: never overwrite local optimistic edits/deletes
      // that may still be in flight.
      set((state) => {
        const known = new Set(state.transactions.map((t) => t.id))
        added = server.filter((t) => !known.has(t.id))
        if (added.length === 0) return state
        const next = [...added, ...state.transactions].sort((a, b) =>
          b.occurredAt.localeCompare(a.occurredAt)
        )
        return { transactions: next, txsByAccountId: buildIndex(next) }
      })
      return added.length
    } catch {
      return 0
    }
  },
  add: async (data) => {
    // Optimistic: generate id client-side, update UI immediately, persist in background.
    const prev = get().transactions
    const tx: Transaction = { ...data, id: uuid() } as Transaction
    const transactions = [tx, ...prev]
    set({ transactions, txsByAccountId: buildIndex(transactions) })
    void (async () => {
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(tx),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch {
        // Remove only this failed optimistic item. This preserves any other
        // movement the user may have created while the request was in flight.
        set((state) => {
          const next = state.transactions.filter((item) => item.id !== tx.id)
          return { transactions: next, txsByAccountId: buildIndex(next) }
        })
        toast.error(
          "No se pudo guardar el movimiento. Revisa tu conexión e inténtalo de nuevo."
        )
      }
    })()
    return tx
  },
  addMany: async (data) => {
    const prev = get().transactions
    const added = data.map((item) => ({ ...item, id: uuid() }) as Transaction)
    const transactions = [...added, ...prev]
    set({ transactions, txsByAccountId: buildIndex(transactions) })
    void (async () => {
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(added),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch {
        const addedIds = new Set(added.map((item) => item.id))
        set((state) => {
          const next = state.transactions.filter(
            (item) => !addedIds.has(item.id)
          )
          return { transactions: next, txsByAccountId: buildIndex(next) }
        })
        toast.error(
          "No se pudo guardar el traslado. Ninguna cuenta fue modificada."
        )
      }
    })()
    return added
  },
  update: async (id, patch) => {
    const current = get().transactions
    const target = current.find((t) => t.id === id)
    // Si es un traslado, el monto y la fecha deben permanecer iguales en ambas
    // patas para que origen y destino sigan cuadrando. La dirección de cada
    // pata NO se toca.
    const sibling =
      target?.kind === "transfer" && target.transferPairId
        ? current.find(
            (t) => t.transferPairId === target.transferPairId && t.id !== id
          )
        : undefined
    const siblingPatch: Partial<Transaction> = {}
    if (sibling) {
      if (patch.amount !== undefined) siblingPatch.amount = patch.amount
      if (patch.occurredAt !== undefined)
        siblingPatch.occurredAt = patch.occurredAt
    }
    const applySibling = sibling && Object.keys(siblingPatch).length > 0

    let optimisticTarget: Transaction | undefined
    let optimisticSibling: Transaction | undefined
    const transactions = current.map((t) => {
      if (t.id === id) {
        optimisticTarget = applyPatch(t, patch)
        return optimisticTarget
      }
      if (applySibling && t.id === sibling!.id) {
        optimisticSibling = { ...t, ...siblingPatch }
        return optimisticSibling
      }
      return t
    })
    set({ transactions, txsByAccountId: buildIndex(transactions) })

    const patchReq = (txId: string, body: TransactionPatch) =>
      fetch(`/api/transactions/${txId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      })

    void (async () => {
      try {
        // The API updates amount/date on both transfer legs in one request.
        await patchReq(id, patch)
      } catch {
        set((state) => {
          const next = state.transactions.map((item) => {
            if (item === optimisticTarget && target) return target
            if (item === optimisticSibling && sibling) return sibling
            return item
          })
          return { transactions: next, txsByAccountId: buildIndex(next) }
        })
        toast.error(
          "No se pudo actualizar el movimiento. Revisa tu conexión e inténtalo de nuevo."
        )
      }
    })()
  },
  remove: async (id) => {
    const current = get().transactions
    const target = current.find((t) => t.id === id)
    // Un traslado son dos patas (out + in) ligadas por transferPairId.
    // Borrar una sola dejaría el movimiento cojo y "perdería" plata, así que
    // se borran ambas juntas.
    const idsToRemove =
      target?.kind === "transfer" && target.transferPairId
        ? current
            .filter((t) => t.transferPairId === target.transferPairId)
            .map((t) => t.id)
        : [id]
    const transactions = current.filter((t) => !idsToRemove.includes(t.id))
    set({ transactions, txsByAccountId: buildIndex(transactions) })
    const removed = current.filter((t) => idsToRemove.includes(t.id))
    void (async () => {
      try {
        await Promise.all(
          idsToRemove.map((rid) =>
            fetch(`/api/transactions/${rid}`, { method: "DELETE" }).then(
              (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
              }
            )
          )
        )
      } catch {
        set((state) => {
          const existing = new Set(state.transactions.map((item) => item.id))
          const next = [
            ...removed.filter((item) => !existing.has(item.id)),
            ...state.transactions,
          ]
          return { transactions: next, txsByAccountId: buildIndex(next) }
        })
        toast.error(
          "No se pudo eliminar el movimiento. Revisa tu conexión e inténtalo de nuevo."
        )
      }
    })()
  },
  forAccount: (accountId) => get().txsByAccountId.get(accountId) ?? EMPTY_TXS,
}))
