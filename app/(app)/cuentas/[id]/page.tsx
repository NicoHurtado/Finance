"use client";
import { use, useState, useCallback, useEffect, useMemo } from "react";
import { startOfMonth } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useAccountsStore } from "@/lib/store/accounts";
import { useTransactionsStore } from "@/lib/store/transactions";
import { useUIStore } from "@/lib/store/ui";
import { computeAccountBalance } from "@/lib/finance/net-worth";
import { formatAccountBalance, formatMoney } from "@/lib/finance/format";
import {
  utilizationPct,
  availableCredit,
} from "@/lib/finance/credit";
import { accruedYield, daysToMaturity } from "@/lib/finance/fixed-income";
import { CardPhoto } from "@/components/accounts/card-photo";
import { CardFace } from "@/components/accounts/card-face";
import { savingsIcon, savingsSubtitle } from "@/components/accounts/savings-face";
import { resolveCardArt } from "@/lib/finance/card-art";
import { getColorDef, type AccountColor } from "@/lib/finance/colors";
import { PayCreditCardDialog } from "@/components/accounts/pay-credit-card-dialog";
import { FixedIncomeDepositDialog } from "@/components/accounts/fixed-income-deposit-dialog";
import { TransferToFixedIncomeDialog } from "@/components/accounts/transfer-to-fixed-income-dialog";
import { useExchangeRateStore } from "@/lib/store/exchange-rate";
import { AccountActivity } from "@/components/accounts/account-activity";
import { AdjustBalanceDialog } from "@/components/accounts/adjust-balance-dialog";
import { InvestmentBalanceChart } from "@/components/accounts/investment-balance-chart";
import { InstallmentPurchases } from "@/components/accounts/installment-purchases";
import { creditPaymentSummary } from "@/lib/finance/installments";

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const account = useAccountsStore((s) => s.getById(id));
  const accountsLoaded = useAccountsStore((s) => s.loaded);
  const txs = useTransactionsStore((s) => s.forAccount(id));
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const usdToCop = useExchangeRateStore((s) => s.usdToCop);

  const [payOpen, setPayOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMode, setDepositMode] = useState<"ingreso" | "retiro">("ingreso");
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const refreshTxs = useTransactionsStore((s) => s.refresh);
  const refreshAccounts = useAccountsStore((s) => s.refresh);

  const syncBalance = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/accounts/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al sincronizar");
      if (!silent) toast.success(`Balance sincronizado: ${data.balance.toLocaleString()}`);
      await Promise.all([refreshTxs(), refreshAccounts()]);
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }, [id, refreshTxs, refreshAccounts]);

  // Auto-sync once per day for investment accounts with sync configured
  useEffect(() => {
    if (account?.type !== "investment") return;
    const inv = account as import("@/lib/types").InvestmentAccount;
    if (!inv.syncUrl) return;
    const today = new Date().toISOString().slice(0, 10);
    if (inv.lastSyncDate === today) return; // already synced today
    const timer = window.setTimeout(() => void syncBalance(true), 0);
    return () => window.clearTimeout(timer);
  }, [account, syncBalance]);

  // Volver con el historial del navegador es instantáneo: restaura la página
  // anterior ya renderizada (router cache) en vez de disparar una navegación
  // nueva que vuelve a pedir el RSC de /cuentas al servidor. Si se entró por
  // enlace directo (sin historial), se cae al push normal.
  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/cuentas");
    }
  }, [router]);

  // Month-to-date flow summary for the account (used to fill the debit detail).
  const monthStats = useMemo(() => {
    const ms = startOfMonth(new Date());
    let income = 0;
    let expense = 0;
    let count = 0;
    for (const t of txs) {
      if (new Date(t.occurredAt) < ms) continue;
      count++;
      if (t.kind === "income") income += t.amount;
      else if (t.kind === "expense") expense += t.amount;
    }
    return { income, expense, net: income - expense, count };
  }, [txs]);

  // Al recargar de golpe, el store todavía no tiene nada: eso no es una cuenta
  // inexistente, es que aún no ha llegado. Sin esta distinción la pantalla
  // parpadea en "Cuenta no encontrada" antes de pintar.
  if (!account) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {accountsLoaded ? "Cuenta no encontrada." : "Cargando…"}
      </div>
    );
  }

  const balance = computeAccountBalance(account, txs);


  const isInvestmentUsd = account.type === "investment" && account.currency === "USD";
  const copValue =
    isInvestmentUsd && usdToCop
      ? Math.round(balance * usdToCop).toLocaleString("es-CO", {
          style: "currency",
          currency: "COP",
          maximumFractionDigits: 0,
        })
      : null;

  const art = resolveCardArt(account);
  const isCard = account.type === "debit" || account.type === "credit";
  const accent = getColorDef(account.color as AccountColor | undefined).base;

  const heading =
    account.type === "credit"
      ? "Deuda actual"
      : account.type === "investment"
        ? "Valor actual"
        : "Saldo";
  const subtitle =
    isCard
      ? `${account.type === "credit" ? "Crédito" : "Débito"} · ${account.institution}`
      : savingsSubtitle(
          account.type,
          account.name,
          account.institution,
          account.type === "fixed_income" ? account.annualRate : undefined,
        );

  const util = account.type === "credit" ? utilizationPct(account, txs) : 0;
  const payment = account.type === "credit" ? creditPaymentSummary(txs, balance) : null;
  const hasDeferred = !!payment && payment.active.length > 0;

  /** Cifras del producto: mismas casillas para todos, contenido por tipo. */
  const metrics: { label: string; value: string; tone?: "up" | "down"; progress?: number }[] =
    account.type === "credit"
      ? [
          { label: "Límite utilizado", value: `${util.toFixed(0)}%`, tone: "down", progress: Math.min(100, util) },
          {
            label: "Crédito disponible",
            value: formatMoney(availableCredit(account, txs), account.currency),
            tone: "up",
            progress: account.creditLimit > 0 ? (availableCredit(account, txs) / account.creditLimit) * 100 : 0,
          },
          { label: "Cupo total", value: formatMoney(account.creditLimit, account.currency) },
          { label: "Movimientos del mes", value: String(monthStats.count) },
        ]
      : account.type === "debit"
        ? [
            { label: "Ingresos del mes", value: `+${formatMoney(monthStats.income, account.currency)}`, tone: "up" },
            { label: "Gastos del mes", value: `-${formatMoney(monthStats.expense, account.currency)}`, tone: "down" },
            {
              label: "Flujo neto",
              value: `${monthStats.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthStats.net), account.currency)}`,
              tone: monthStats.net >= 0 ? "up" : "down",
            },
            { label: "Movimientos del mes", value: String(monthStats.count) },
          ]
        : account.type === "fixed_income"
          ? [
              { label: "Rendimiento", value: formatMoney(accruedYield(account, txs), account.currency), tone: "up" },
              { label: "Tasa anual", value: `${account.annualRate}%` },
              { label: "Balance inicial", value: formatAccountBalance(account.type, account.initialBalance, account.currency) },
              account.maturityDate
                ? { label: "Días restantes", value: String(daysToMaturity(account)) }
                : { label: "Vencimiento", value: "Sin fecha" },
            ]
          : [
              { label: "Valor en COP", value: copValue ?? "—" },
              { label: "Balance inicial", value: formatAccountBalance(account.type, account.initialBalance, account.currency) },
              { label: "Moneda", value: account.currency },
              { label: "Entidad", value: account.institution },
            ];

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-8 pb-32 md:pb-8 space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="size-9 rounded-full hover:bg-muted flex items-center justify-center"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-medium md:text-lg md:font-semibold">Detalle de Cuenta</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAdjustOpen(true)}
            className="size-9 rounded-full hover:bg-muted flex items-center justify-center"
            aria-label="Ajustar balance"
            title="Ajustar balance"
          >
            <Scale className="size-4" />
          </button>
          <Link
            href={`/cuentas/${account.id}/editar`}
            className="size-9 rounded-full hover:bg-muted flex items-center justify-center"
            aria-label="Editar"
          >
            <Pencil className="size-4" />
          </Link>
        </div>
      </div>

      {/* Una sola pieza: el arte a la izquierda, las cifras y las acciones a la
          derecha. Nada de tarjetas dentro de tarjetas ni huecos en blanco. */}
      <section
        className={cn(
          "surface p-5 md:p-6 gap-6",
          // Solo las tarjetas parten la pieza en dos: su arte ocupa una columna.
          // Los productos sin plástico no tienen qué poner ahí, así que van a
          // una sola columna en vez de dejar medio panel en blanco.
          isCard
            ? "grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-start"
            : "flex flex-col",
        )}
      >
        {isCard ? (
          <div className="flex flex-col gap-3">
            {art?.imageUrl ? (
              <CardPhoto src={art.imageUrl} name={account.name} />
            ) : (
              <div className="relative aspect-[1010/630] w-full overflow-hidden rounded-2xl border">
                {art && <CardFace art={art} />}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{account.name}</div>
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
            >
              {savingsIcon(account.type, "size-6")}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold tracking-[-0.02em]">{account.name}</div>
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[12px] font-medium tracking-[-0.005em] text-muted-foreground">
              {heading}
            </div>
            <div
              className={cn(
                "mt-1 text-[2rem] md:text-[2.5rem] font-semibold leading-none tabular-nums",
                ((account.type === "credit" && balance > 0) ||
                  (account.type !== "credit" && balance < 0)) &&
                  "text-destructive",
              )}
            >
              {formatAccountBalance(account.type, balance, account.currency)}
            </div>
            {hasDeferred && payment && (
              <div className="mt-2 text-xs text-muted-foreground tabular-nums">
                Pago del mes{" "}
                <span className="font-medium text-foreground">
                  {formatMoney(payment.monthlyPayment, account.currency)}
                </span>
                <span className="text-muted-foreground/80">
                  {" "}· {formatMoney(payment.singlePayment, account.currency)} a 1 cuota +{" "}
                  {formatMoney(payment.installmentsTotal, account.currency)} en cuotas
                </span>
              </div>
            )}
            {isInvestmentUsd && copValue && (
              <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">{copValue} COP</div>
            )}
            {account.type === "fixed_income" && account.maturityDate && (
              <div className="mt-1.5 text-xs text-muted-foreground">Vence el {account.maturityDate}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-2xl bg-muted/50 px-4 py-3">
                <div className="text-[11px] font-medium tracking-[-0.005em] text-muted-foreground">
                  {m.label}
                </div>
                <div
                  className={cn(
                    "mt-1 truncate text-[17px] font-semibold tabular-nums",
                    m.tone === "up" && "text-positive",
                    m.tone === "down" && "text-destructive",
                  )}
                >
                  {m.value}
                </div>
                {m.progress !== undefined && <Progress className="mt-2 h-1.5" value={m.progress} />}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openQuickAdd({ accountId: account.id })}>
              <Plus className="size-4" /> Registrar movimiento
            </Button>
            {account.type === "debit" && (
              <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
                Pasar a renta fija
              </Button>
            )}
            {account.type === "credit" && (
              <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                Pagar tarjeta
              </Button>
            )}
            {(account.type === "fixed_income" || account.type === "investment") && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setDepositMode("ingreso"); setDepositOpen(true); }}>
                  Depositar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setDepositMode("retiro"); setDepositOpen(true); }}>
                  Retirar
                </Button>
              </>
            )}
            {account.type === "investment" && (account as import("@/lib/types").InvestmentAccount).syncUrl && (
              <Button size="sm" variant="ghost" onClick={() => syncBalance()} disabled={syncing}>
                {syncing ? "Sincronizando…" : "↻ Sincronizar"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {account.type === "investment" && <InvestmentBalanceChart account={account} />}

      {hasDeferred && payment && <InstallmentPurchases summary={payment} currency={account.currency} />}

      <AccountActivity accountId={account.id} />

      {account.type === "credit" && (
        <PayCreditCardDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          creditAccount={account}
          currentDebt={balance}
        />
      )}

      {(account.type === "fixed_income" || account.type === "investment") && (
        <FixedIncomeDepositDialog
          key={`${depositOpen ? "open" : "closed"}-${depositMode}`}
          open={depositOpen}
          onOpenChange={setDepositOpen}
          account={account}
          currentBalance={balance}
          initialMode={depositMode}
        />
      )}

      <AdjustBalanceDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        account={account}
        currentBalance={balance}
      />

      {account.type === "debit" && (
        <TransferToFixedIncomeDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          sourceAccount={account}
          sourceBalance={balance}
        />
      )}
    </div>
  );
}
