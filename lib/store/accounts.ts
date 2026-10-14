"use client"
import { create } from "zustand"
import { v4 as uuid } from "uuid"
import { toast } from "sonner"
import type { Account } from "@/lib/types"

const TYPE_ORDER: Record<string, number> = {
  credit: 0,
  debit: 1,
  fixed_income: 2,
  investment: 3,
}

function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort(
    (a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99)
  )
}

function deriveActive(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.active !== false)
}

interface State {
  accounts: Account[]
  activeAccounts: Account[]
  loaded: boolean
  isHydrating: boolean
  seed: (accounts: Account[]) => void
  hydrate: () => Promise<void>
  refresh: () => Promise<void>
  /** Trae las cuentas creadas en otro dispositivo. Devuelve cuántas llegaron. */
  pullNew: () => Promise<number>
  add: (data: Omit<Account, "id" | "createdAt">) => Promise<Account>
  update: (id: string, patch: Partial<Account>) => Promise<void>
  setHomeVisibility: (id: string, visible: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Account | undefined
}

export const useAccountsStore = create<State>()((set, get) => ({
  accounts: [],
  activeAccounts: [],
  loaded: false,
  isHydrating: false,
  seed: (all) => {
    // Server-prefetched data: skip if the client already loaded fresher state.
    if (get().loaded) return
    const accounts = sortAccounts(all)
    set({ accounts, activeAccounts: deriveActive(accounts), loaded: true })
  },
  hydrate: async () => {
    const { loaded, isHydrating } = get()
    if (loaded || isHydrating) return
    set({ isHydrating: true })
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const all: Account[] = await res.json()
      const accounts = sortAccounts(all)
      set({
        accounts,
        activeAccounts: deriveActive(accounts),
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
      const res = await fetch("/api/accounts", { cache: "no-store" })
      if (!res.ok) return 0
      const server: Account[] = await res.json()
      let added = 0
      // Solo se agregan ids desconocidos: nunca se pisan ediciones locales
      // optimistas que sigan en vuelo.
      set((state) => {
        const known = new Set(state.accounts.map((a) => a.id))
        const fresh = server.filter((a) => !known.has(a.id))
        added = fresh.length
        if (added === 0) return state
        const accounts = sortAccounts([...state.accounts, ...fresh])
        return { accounts, activeAccounts: deriveActive(accounts) }
      })
      return added
    } catch {
      return 0
    }
  },
  add: async (data) => {
    // Optimistic: build the account locally and show it immediately.
    const id = uuid()
    const createdAt = new Date().toISOString()
    const full = { ...data, id, createdAt } as Account & { syncToken?: string }
    // Never keep the secret syncToken in client state.
    const { syncToken: _secret, ...local } = full
    void _secret
    const account = local as Account
    const accounts = sortAccounts([...get().accounts, account])
    set({ accounts, activeAccounts: deriveActive(accounts) })
    void fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(full),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      })
      .catch(() => {
        set((state) => {
          const next = state.accounts.filter((item) => item.id !== id)
          return { accounts: next, activeAccounts: deriveActive(next) }
        })
        toast.error(
          "No se pudo guardar la cuenta. Revisa tu conexión e inténtalo de nuevo."
        )
      })
    return account
  },
  update: async (id, patch) => {
    const previous = get().accounts.find((account) => account.id === id)
    let optimistic: Account | undefined
    const accounts = get().accounts.map((a) => {
      if (a.id !== id) return a
      optimistic = { ...a, ...patch } as Account
      return optimistic
    })
    set({ accounts, activeAccounts: deriveActive(accounts) })
    void fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      })
      .catch(() => {
        if (!previous) return
        set((state) => {
          const next = sortAccounts(
            state.accounts.map((item) =>
              item === optimistic ? previous : item
            )
          )
          return { accounts: next, activeAccounts: deriveActive(next) }
        })
        toast.error(
          "No se pudo actualizar la cuenta. Revisa tu conexión e inténtalo de nuevo."
        )
      })
  },
  setHomeVisibility: async (id, visible) => {
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ showOnHome: visible }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const saved: Account | null = await res.json()
    if (!saved || saved.id !== id || saved.showOnHome !== visible) {
      throw new Error("No se pudo guardar la selección")
    }
    set((state) => {
      const accounts = state.accounts.map((account) =>
        account.id === id ? { ...account, showOnHome: visible } : account
      )
      return { accounts, activeAccounts: deriveActive(accounts) }
    })
  },
  remove: async (id) => {
    const removed = get().accounts.find((account) => account.id === id)
    const accounts = get().accounts.filter((a) => a.id !== id)
    set({ accounts, activeAccounts: deriveActive(accounts) })
    void fetch(`/api/accounts/${id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      })
      .catch(() => {
        if (!removed) return
        set((state) => {
          if (state.accounts.some((item) => item.id === id)) return state
          const next = sortAccounts([...state.accounts, removed])
          return { accounts: next, activeAccounts: deriveActive(next) }
        })
        toast.error(
          "No se pudo eliminar la cuenta. Revisa tu conexión e inténtalo de nuevo."
        )
      })
  },
  getById: (id) => get().accounts.find((a) => a.id === id),
}))
