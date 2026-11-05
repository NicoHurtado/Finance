"use client"

import { useId, useState } from "react"
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { useAccountsStore } from "@/lib/store/accounts"
import type { Account, AccountType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"

const TYPE_LABEL: Record<AccountType, string> = {
  credit: "Crédito",
  debit: "Débito",
  fixed_income: "Renta fija",
  investment: "Inversiones",
}

export function HomeAccountsPicker() {
  const accounts = useAccountsStore((s) => s.activeAccounts)
  const setHomeVisibility = useAccountsStore((s) => s.setHomeVisibility)
  const reorder = useAccountsStore((s) => s.reorder)
  const [saving, setSaving] = useState(false)
  const id = useId()

  async function toggle(accountId: string, visible: boolean) {
    setSaving(true)
    try {
      await setHomeVisibility(accountId, visible)
    } catch {
      toast.error("No se pudo guardar la selección. Inténtalo de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  // Accounts are shown grouped by type, so they move within their group.
  const groups = accounts.reduce<{ type: AccountType; items: Account[] }[]>(
    (acc, account) => {
      const last = acc[acc.length - 1]
      if (last && last.type === account.type) last.items.push(account)
      else acc.push({ type: account.type, items: [account] })
      return acc
    },
    []
  )

  async function move(group: Account[], index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= group.length) return
    const ids = group.map((a) => a.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setSaving(true)
    try {
      await reorder(ids)
    } catch {
      toast.error("No se pudo guardar el orden. Inténtalo de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal aria-hidden="true" /> Organizar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Organizar cuentas</DialogTitle>
          <DialogDescription>
            Elige qué cuentas ver en la página principal y ordénalas con las
            flechas. El orden se guarda y también se usa en Cuentas. Los saldos
            y totales no cambian.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[45dvh] overflow-y-auto" aria-busy={saving}>
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aún no tienes cuentas.
            </p>
          )}
          {groups.map(({ type, items }) => (
            <div key={type} className="pb-2">
              <div className="px-2 pt-2 pb-1 text-[12px] font-medium text-muted-foreground">
                {TYPE_LABEL[type]}
              </div>
              {items.map((account, index) => (
                <div
                  key={account.id}
                  className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    id={`${id}-${account.id}`}
                    checked={account.showOnHome !== false}
                    disabled={saving}
                    onCheckedChange={(checked) =>
                      void toggle(account.id, checked === true)
                    }
                  />
                  <label
                    htmlFor={`${id}-${account.id}`}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <span className="block font-medium break-words">
                      {account.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {account.institution} · {account.currency}
                      {"last4" in account && account.last4
                        ? ` · ${account.last4}`
                        : ""}
                    </span>
                  </label>
                  {items.length > 1 && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={saving || index === 0}
                        onClick={() => void move(items, index, -1)}
                        aria-label={`Subir ${account.name}`}
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={saving || index === items.length - 1}
                        onClick={() => void move(items, index, 1)}
                        aria-label={`Bajar ${account.name}`}
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter>
          <p
            role="status"
            className="mr-auto self-center text-xs text-muted-foreground"
          >
            {saving ? "Guardando…" : "Los cambios se guardan automáticamente."}
          </p>
          <DialogClose asChild>
            <Button>Listo</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
