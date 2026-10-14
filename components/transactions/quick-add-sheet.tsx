"use client"
import { useRef, useState, useEffect } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/lib/store/ui"
import { useAccountsStore } from "@/lib/store/accounts"
import { useTransactionsStore } from "@/lib/store/transactions"
import { useSettingsStore } from "@/lib/store/settings"
import { useMediaQuery } from "@/hooks/use-media-query"
import { TypeToggle } from "./type-toggle"
import { AmountDisplay } from "./amount-display"
import { CategoryPicker } from "./category-picker"
import { NumericKeypad } from "./numeric-keypad"
import { AccountPicker } from "./account-picker"
import { InstallmentsPicker } from "./installments-picker"
import { type Installments, type TransactionKind } from "@/lib/types"
import { useCategoriesStore } from "@/lib/store/categories"
import { getCategoryIcon } from "@/lib/finance/categories"
import { cn } from "@/lib/utils"
import { transferDirectionFor } from "@/lib/finance/transactions"

function applyKey(current: string, key: string): string {
  if (key === "back") return current.length <= 1 ? "" : current.slice(0, -1)
  if (key === ".") {
    if (current.includes(".")) return current
    return current === "" ? "0." : current + "."
  }
  // digit
  if (current === "0") return key
  if (current.includes(".")) {
    const [, dec = ""] = current.split(".")
    if (dec.length >= 2) return current
  }
  return current + key
}

function QuickAddBody({
  onClose,
  variant,
}: {
  onClose: () => void
  variant: "mobile" | "desktop"
}) {
  const prefill = useUIStore((s) => s.prefill)
  const accounts = useAccountsStore((s) => s.activeAccounts)
  const addTx = useTransactionsStore((s) => s.add)
  const addManyTxs = useTransactionsStore((s) => s.addMany)
  const lastUsedAccountId = useSettingsStore((s) => s.lastUsedAccountId)
  const setLastUsedAccount = useSettingsStore((s) => s.setLastUsedAccount)
  const defaultCurrency = useSettingsStore((s) => s.defaultCurrency)

  const [kind, setKind] = useState<TransactionKind>(
    prefill.kind === "income" ? "income" : "expense"
  )
  const [amount, setAmount] = useState("")
  const categories = useCategoriesStore((s) => s.categories)
  const [category, setCategory] = useState<string | undefined>()
  const [accountId, setAccountId] = useState<string | undefined>(
    prefill.accountId ?? lastUsedAccountId ?? accounts[0]?.id
  )
  const [destinationId, setDestinationId] = useState<string | undefined>()
  const [description, setDescription] = useState("")
  const [installments, setInstallments] = useState<Installments | undefined>()

  const amountInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus amount on desktop open
  useEffect(() => {
    if (variant === "desktop" && amountInputRef.current) {
      amountInputRef.current.focus()
    }
  }, [variant])

  const isTransfer = kind === "transfer"
  const amountNum = parseFloat(amount || "0")
  const sourceAccount = accounts.find((a) => a.id === accountId)
  const destinationAccount = accounts.find((a) => a.id === destinationId)
  // Las compras con tarjeta de crédito pueden diferirse; por defecto, 1 cuota.
  const canDefer = kind === "expense" && sourceAccount?.type === "credit"
  const installmentsPicker = canDefer ? (
    <InstallmentsPicker
      amount={amountNum}
      currency={sourceAccount.currency}
      value={installments}
      onChange={setInstallments}
    />
  ) : null
  const transferCurrencyMismatch =
    isTransfer &&
    !!sourceAccount &&
    !!destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency
  const canConfirm = isTransfer
    ? amountNum > 0 &&
      !!accountId &&
      !!destinationId &&
      accountId !== destinationId &&
      !transferCurrencyMismatch
    : amountNum > 0 && !!sourceAccount && !!category

  const submit = async () => {
    if (!canConfirm || !accountId || !sourceAccount) return
    const now = new Date().toISOString()

    if (isTransfer) {
      if (!destinationId || accountId === destinationId) return
      const src = sourceAccount
      const dst = destinationAccount
      if (!src || !dst || src.currency !== dst.currency) return
      const pairId = `pair-${Date.now()}`
      const saved = await addManyTxs([
        {
          accountId,
          kind: "transfer",
          direction: transferDirectionFor(src.type, "source"),
          amount: amountNum,
          category: "Traslado",
          description:
            description || (dst ? `Traslado a ${dst.name}` : undefined),
          occurredAt: now,
          transferPairId: pairId,
        },
        {
          accountId: destinationId,
          kind: "transfer",
          direction: transferDirectionFor(dst.type, "destination"),
          amount: amountNum,
          category: "Traslado",
          description:
            description || (src ? `Traslado desde ${src.name}` : undefined),
          occurredAt: now,
          transferPairId: pairId,
        },
      ])
      if (saved.length !== 2) return
      await setLastUsedAccount(accountId)
      toast.success(`Traslado registrado desde ${sourceAccount.name}`)
      onClose()
      return
    }

    if (!category) return
    const saved = await addTx({
      accountId,
      kind,
      amount: amountNum,
      category,
      description: description || undefined,
      occurredAt: now,
      ...(canDefer && installments ? { installments } : {}),
    })
    if (!saved) return
    await setLastUsedAccount(accountId)
    toast.success(
      `${kind === "income" ? "Ingreso" : "Gasto"} registrado en ${sourceAccount.name}`
    )
    onClose()
  }

  const onKeyDownGlobal = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canConfirm) {
      e.preventDefault()
      submit()
    }
  }

  // ───────── DESKTOP COMPACT FORM ─────────
  if (variant === "desktop") {
    return (
      <div
        className="flex w-full flex-col gap-4 p-6"
        onKeyDown={onKeyDownGlobal}
      >
        <h2 className="text-lg font-semibold">Nueva transacción</h2>

        <TypeToggle
          value={kind === "income" || kind === "transfer" ? kind : "expense"}
          onChange={setKind}
        />

        <div className="space-y-1.5">
          <Label htmlFor="qa-amount-desktop">Monto</Label>
          <Input
            id="qa-amount-desktop"
            ref={amountInputRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={cn(
              "h-11 w-full text-xl font-bold tabular-nums",
              isTransfer
                ? "text-foreground"
                : kind === "income"
                  ? "text-positive"
                  : "text-destructive"
            )}
          />
        </div>

        {isTransfer ? (
          <>
            <div className="space-y-1.5">
              <Label>Origen</Label>
              <AccountPicker value={accountId} onChange={setAccountId} />
            </div>
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <AccountPicker
                value={destinationId}
                onChange={setDestinationId}
              />
              {accountId && destinationId && accountId === destinationId && (
                <p className="text-xs text-destructive">
                  El origen y el destino deben ser distintos.
                </p>
              )}
              {transferCurrencyMismatch && (
                <p className="text-xs text-destructive">
                  El traslado requiere cuentas en la misma moneda.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Cuenta</Label>
              <AccountPicker value={accountId} onChange={setAccountId} />
              {installmentsPicker}
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => {
                  const Icon = getCategoryIcon(cat.name)
                  const active = cat.name === category
                  return (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => setCategory(cat.name)}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-xs font-medium transition",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "bg-background hover:bg-accent"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{cat.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="qa-desc-desktop">Descripción</Label>
          <Input
            id="qa-desc-desktop"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-2">
          <p className="text-xs text-muted-foreground">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            para registrar
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!canConfirm} onClick={submit}>
              Registrar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ───────── MOBILE LAYOUT (unchanged) ─────────
  return (
    <div
      className="mx-auto flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex size-9 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="size-5" />
        </button>
      </div>

      <TypeToggle
        value={kind === "income" || kind === "transfer" ? kind : "expense"}
        onChange={setKind}
      />

      <AmountDisplay
        value={amount}
        currency={defaultCurrency}
        tone={isTransfer ? "income" : kind === "income" ? "income" : "expense"}
      />

      {isTransfer ? (
        <>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Origen</div>
            <AccountPicker value={accountId} onChange={setAccountId} />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Destino</div>
            <AccountPicker value={destinationId} onChange={setDestinationId} />
            {accountId && destinationId && accountId === destinationId && (
              <p className="text-xs text-destructive">
                El origen y el destino deben ser distintos.
              </p>
            )}
            {transferCurrencyMismatch && (
              <p className="text-xs text-destructive">
                El traslado requiere cuentas en la misma moneda.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <CategoryPicker value={category} onChange={setCategory} />

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Cuenta</div>
            <AccountPicker value={accountId} onChange={setAccountId} />
            {installmentsPicker}
          </div>
        </>
      )}

      <Input
        placeholder="Descripción (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <NumericKeypad onPress={(k) => setAmount((cur) => applyKey(cur, k))} />

      <Button
        disabled={!canConfirm}
        className="h-12 w-full text-base"
        onClick={submit}
      >
        Confirmar
      </Button>
    </div>
  )
}

export function QuickAddPanel() {
  const quickAddOpen = useUIStore((s) => s.quickAddOpen)
  const closeQuickAdd = useUIStore((s) => s.closeQuickAdd)
  const prefill = useUIStore((s) => s.prefill)
  // Touch devices (phones AND tablets like iPad) get the numeric keypad layout.
  // Only true pointer/mouse devices get the compact form with a native input.
  const isDesktop = useMediaQuery("(min-width: 768px) and (pointer: fine)")
  const bodyKey = `${quickAddOpen ? "open" : "closed"}-${prefill.accountId ?? ""}-${prefill.kind ?? ""}`
  if (isDesktop) {
    return (
      <Dialog open={quickAddOpen} onOpenChange={(o) => !o && closeQuickAdd()}>
        <DialogContent className="w-[min(560px,calc(100vw-2rem))] max-w-none overflow-hidden p-0">
          <DialogTitle className="sr-only">Nueva transacción</DialogTitle>
          <QuickAddBody
            key={bodyKey}
            onClose={closeQuickAdd}
            variant="desktop"
          />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Sheet open={quickAddOpen} onOpenChange={(o) => !o && closeQuickAdd()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[90vh] p-0"
      >
        <SheetTitle className="sr-only">Nueva transacción</SheetTitle>
        <QuickAddBody key={bodyKey} onClose={closeQuickAdd} variant="mobile" />
      </SheetContent>
    </Sheet>
  )
}
