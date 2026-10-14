"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { AccountPreviewCard } from "@/components/accounts/account-preview-card";
import { ColorPicker } from "@/components/accounts/color-picker";
import { CardNetworkPicker } from "@/components/accounts/card-network-picker";
import { CardPresetPicker } from "@/components/accounts/card-preset-picker";
import { useAccountsStore } from "@/lib/store/accounts";
import type { Account, CardNetwork, Currency } from "@/lib/types";
import type { AccountColor } from "@/lib/finance/colors";

export default function EditarCuentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const account = useAccountsStore((s) => s.getById(id));
  const update = useAccountsStore((s) => s.update);
  const remove = useAccountsStore((s) => s.remove);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hooks must be called unconditionally — initialize all from account or defaults
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [currency, setCurrency] = useState<Currency>(
    (account?.currency as Currency) ?? "COP",
  );
  const [initialBalance, setInitialBalance] = useState(
    String(account?.initialBalance ?? 0),
  );
  const [color, setColor] = useState<AccountColor>(
    (account?.color as AccountColor) ?? "blue",
  );
  const [miniLabel, setMiniLabel] = useState(account?.miniLabel ?? "");

  // Card artwork: pinned real-card design and/or a photo of the actual card.
  const [presetId, setPresetId] = useState<string | undefined>(account?.presetId);
  const [artImageUrl, setArtImageUrl] = useState(account?.artImageUrl ?? "");

  // credit
  const [creditLimit, setCreditLimit] = useState(
    account?.type === "credit" ? String(account.creditLimit) : "",
  );
  const [last4, setLast4] = useState(
    account?.type === "credit" ? account.last4 : "",
  );
  const [expDate, setExpDate] = useState(
    account?.type === "credit" ? account.expDate : "",
  );
  const [creditNetwork, setCreditNetwork] = useState<CardNetwork>(
    account?.type === "credit" ? account.network : "visa",
  );

  // debit (optional)
  const [debitLast4, setDebitLast4] = useState(
    account?.type === "debit" ? (account.last4 ?? "") : "",
  );
  const [debitNetwork, setDebitNetwork] = useState<CardNetwork | undefined>(
    account?.type === "debit" ? account.network : undefined,
  );

  // fixed_income
  const [annualRate, setAnnualRate] = useState(
    account?.type === "fixed_income" ? String(account.annualRate) : "",
  );
  const [startDate, setStartDate] = useState(
    account?.type === "fixed_income" ? account.startDate : "",
  );
  const [maturityDate, setMaturityDate] = useState(
    account?.type === "fixed_income" ? (account.maturityDate ?? "") : "",
  );
  const [isGoal, setIsGoal] = useState(
    account?.type === "fixed_income" ? !!account.isGoal : false,
  );
  const [goalTarget, setGoalTarget] = useState(
    account?.type === "fixed_income" && account.goalTarget
      ? String(account.goalTarget)
      : "",
  );
  const [goalName, setGoalName] = useState(
    account?.type === "fixed_income" ? (account.goalName ?? "") : "",
  );
  const [isActive, setIsActive] = useState(account?.active !== false);
  const [showOnHome, setShowOnHome] = useState(account?.showOnHome !== false);

  // investment sync
  const [syncEnabled, setSyncEnabled] = useState(
    account?.type === "investment" ? !!(account.syncUrl) : false,
  );
  const [syncUrl, setSyncUrl] = useState(
    account?.type === "investment" ? (account.syncUrl ?? "") : "",
  );
  const [syncToken, setSyncToken] = useState(
    account?.type === "investment" ? (account.syncToken ?? "") : "",
  );

  if (!account) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Cuenta no encontrada.
      </div>
    );
  }

  const baseValid = institution.trim() && name.trim() && initialBalance !== "";
  const creditValid =
    account.type !== "credit" ||
    (creditLimit !== "" && /^\d{4}$/.test(last4) && !!expDate);
  const fixedValid =
    account.type !== "fixed_income" ||
    (annualRate !== "" &&
      startDate &&
      (!isGoal || parseFloat(goalTarget || "0") > 0));
  const valid = !!(baseValid && creditValid && fixedValid);

  const save = async () => {
    if (!valid) return;
    const basePatch = {
      institution: institution.trim(),
      name: name.trim(),
      currency,
      initialBalance: parseFloat(initialBalance),
      color,
      active: isActive,
      showOnHome,
      // null = borrar el campo en la DB (el API lo traduce a $unset)
      miniLabel:
        (account.type === "fixed_income" || account.type === "investment") &&
        miniLabel.trim()
          ? miniLabel.trim().toUpperCase()
          : null,
      presetId: presetId ?? null,
      artImageUrl: artImageUrl.trim() || null,
    } as Partial<Account>;
    if (account.type === "credit") {
      await update(id, {
        ...basePatch,
        creditLimit: parseFloat(creditLimit),
        last4,
        expDate,
        network: creditNetwork,
      } as Partial<Account>);
    } else if (account.type === "debit") {
      await update(id, {
        ...basePatch,
        last4: debitLast4 || undefined,
        network: debitNetwork,
      } as Partial<Account>);
    } else if (account.type === "fixed_income") {
      await update(id, {
        ...basePatch,
        annualRate: parseFloat(annualRate),
        startDate,
        maturityDate: maturityDate || null,
        isGoal: isGoal ? true : null,
        goalTarget: isGoal ? parseFloat(goalTarget) : null,
        goalName: isGoal && goalName.trim() ? goalName.trim() : null,
      } as Partial<Account>);
    } else if (account.type === "investment") {
      await update(id, {
        ...basePatch,
        // Si el sync está apagado se borran ambos campos; si está activo pero el
        // token quedó vacío, no se toca (el token guardado nunca llega al cliente).
        syncUrl: syncEnabled && syncUrl.trim() ? syncUrl.trim() : null,
        syncToken: syncEnabled
          ? syncToken.trim() || undefined
          : null,
      } as Partial<Account>);
    } else {
      await update(id, basePatch);
    }
    toast.success("Cuenta actualizada");
    router.push(`/cuentas/${id}`);
  };

  const onDelete = async () => {
    await remove(id);
    toast.success("Cuenta eliminada");
    router.push("/cuentas");
  };

  return (
    <div className="p-4 md:p-8 pb-32 md:pb-8 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/cuentas/${id}`}
            className="size-9 rounded-md hover:bg-accent flex items-center justify-center"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-semibold">Editar Cuenta</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4 mr-1" /> Eliminar
        </Button>
      </div>

      <div className="md:grid md:grid-cols-12 md:gap-6 space-y-4 md:space-y-0">
        {/* Left column: Preview card (sticky on desktop) */}
        <div className="md:col-span-5 md:sticky md:top-6 md:self-start">
          <div className="surface rounded-2xl p-4 md:p-6 space-y-3">
            <div className="text-xs font-medium tracking-[-0.005em] text-muted-foreground">
              Vista previa
            </div>
            <AccountPreviewCard
              type={account.type}
              name={name}
              institution={institution}
              initialBalance={parseFloat(initialBalance || "0")}
              currency={currency}
              last4={account.type === "debit" ? debitLast4 : last4}
              network={account.type === "credit" ? creditNetwork : debitNetwork}
              annualRate={annualRate ? parseFloat(annualRate) : undefined}
              color={color}
              presetId={presetId}
              artImageUrl={artImageUrl}
            />
          </div>
        </div>

        {/* Right column: Form */}
        <div className="md:col-span-7 space-y-4">
        <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="institution">Institución</Label>
          <Input
            id="institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre de la cuenta</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="COP">COP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="initial">Balance inicial</Label>
            <Input
              id="initial"
              type="number"
              inputMode="decimal"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
            />
          </div>
        </div>

        {account.type === "credit" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1.5">
              <Label htmlFor="limit">Límite de crédito</Label>
              <Input
                id="limit"
                type="number"
                inputMode="decimal"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="last4">Últimos 4 dígitos</Label>
                <Input
                  id="last4"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp">Fecha de expiración</Label>
                <Input
                  id="exp"
                  placeholder="MM/AA"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <CardNetworkPicker
                value={creditNetwork}
                onChange={(n) => setCreditNetwork(n)}
              />
            </div>
          </div>
        )}

        {account.type === "fixed_income" && (
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1.5">
              <Label htmlFor="rate">Tasa de interés anual (%)</Label>
              <Input
                id="rate"
                type="number"
                inputMode="decimal"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start">Fecha de inicio</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat">Vencimiento (opcional)</Label>
                <Input
                  id="mat"
                  type="date"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="goal"
                checked={isGoal}
                onCheckedChange={(v) => setIsGoal(v === true)}
              />
              <Label htmlFor="goal" className="text-sm font-normal cursor-pointer">
                Esta cuenta es una meta de ahorro
              </Label>
            </div>
            {isGoal && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="goal-name">Nombre de la meta</Label>
                  <Input
                    id="goal-name"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="Ej: Viaje a Europa"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goal-target">Monto de la meta</Label>
                  <Input
                    id="goal-target"
                    type="number"
                    inputMode="decimal"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Color de la tarjeta</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {(account.type === "debit" || account.type === "credit") && (
        <div className="space-y-3">
          <Label>Diseño de la tarjeta</Label>
          <CardPresetPicker value={presetId} onChange={(p) => setPresetId(p?.id)} />
          <div className="space-y-1.5">
            <Label htmlFor="art-url">Foto de tu tarjeta (opcional)</Label>
            <Input
              id="art-url"
              value={artImageUrl}
              onChange={(e) => setArtImageUrl(e.target.value)}
              placeholder="https://…/mi-tarjeta.png"
            />
            <p className="text-xs text-muted-foreground">
              Si pegas una imagen se usa como fondo real de la tarjeta y de su
              miniatura, por encima del diseño elegido.
            </p>
          </div>
        </div>
      )}

      {(account.type === "fixed_income" || account.type === "investment") && (
        <div className="space-y-1.5">
          <Label htmlFor="mini-label">Etiqueta corta (opcional)</Label>
          <Input
            id="mini-label"
            maxLength={5}
            value={miniLabel}
            onChange={(e) => setMiniLabel(e.target.value.toUpperCase())}
            placeholder={
              account.type === "fixed_income" ? "Ej: NUB, CDT" : "Ej: IBKR, BTC"
            }
          />
          <p className="text-xs text-muted-foreground">
            Aparece dentro del mini-cuadro de color (máx. 5 caracteres).
          </p>
        </div>
      )}

      {account.type === "debit" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Marca (opcional)</Label>
            <CardNetworkPicker
              value={debitNetwork}
              onChange={(n) => setDebitNetwork(n)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debit-last4">Últimos 4 dígitos (opcional)</Label>
            <Input
              id="debit-last4"
              maxLength={4}
              value={debitLast4}
              onChange={(e) => setDebitLast4(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
      )}

          {account.type === "investment" && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sync-enabled"
                  checked={syncEnabled}
                  onCheckedChange={(v) => setSyncEnabled(v === true)}
                />
                <Label htmlFor="sync-enabled" className="text-sm font-normal cursor-pointer">
                  Sincronizar balance automáticamente (IBKR Flex Query)
                </Label>
              </div>
              {syncEnabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>URL Flex Query (SendRequest)</Label>
                    <Input
                      value={syncUrl}
                      onChange={(e) => setSyncUrl(e.target.value)}
                      placeholder="https://ndcdyn.interactivebrokers.com/.../SendRequest?q=QUERY_ID&v=3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Flex Token</Label>
                    <Input
                      type="password"
                      value={syncToken}
                      onChange={(e) => setSyncToken(e.target.value)}
                      placeholder="Token de IBKR Flex Web Service"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Cuenta activa</div>
              <div className="text-xs text-muted-foreground">
                {isActive ? "Visible y aplicada en cálculos" : "Oculta y excluida de cálculos"}
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Mostrar en Inicio</div>
              <div className="text-xs text-muted-foreground">
                {showOnHome ? "Aparece en la pantalla principal" : "Solo aparece en Cuentas"}
              </div>
            </div>
            <Switch checked={showOnHome} onCheckedChange={setShowOnHome} />
          </div>

          <div className="hidden md:block pt-2">
            <Button
              disabled={!valid}
              onClick={save}
              className="w-full h-12 text-base"
            >
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>

      <div className="md:hidden fixed bottom-20 inset-x-0 px-4">
        <Button
          disabled={!valid}
          onClick={save}
          className="w-full h-12 text-base"
        >
          Guardar cambios
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>Eliminar cuenta</DialogTitle>
          <DialogDescription>
            Se eliminará la cuenta &ldquo;{account.name}&rdquo; y todas sus
            transacciones. Esta acción no se puede deshacer.
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
