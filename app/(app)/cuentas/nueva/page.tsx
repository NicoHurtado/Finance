"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { PageHeader, SectionHeading } from "@/components/nav/page-header";
import { AccountPreviewCard } from "@/components/accounts/account-preview-card";
import { ColorPicker } from "@/components/accounts/color-picker";
import { CardNetworkPicker } from "@/components/accounts/card-network-picker";
import { CardPresetPicker } from "@/components/accounts/card-preset-picker";
import { useAccountsStore } from "@/lib/store/accounts";
import { useSettingsStore } from "@/lib/store/settings";
import type { AccountType, CardNetwork, Currency } from "@/lib/types";
import type { AccountColor } from "@/lib/finance/colors";

export default function NuevaCuentaPage() {
  const router = useRouter();
  const add = useAccountsStore((s) => s.add);
  const defaultCurrency = useSettingsStore((s) => s.defaultCurrency);

  const [type, setType] = useState<AccountType>("debit");
  const [institution, setInstitution] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [initialBalance, setInitialBalance] = useState("");
  const [color, setColor] = useState<AccountColor>("blue");
  const [miniLabel, setMiniLabel] = useState("");

  // Card artwork: a pinned real-card design and/or a photo of the actual card.
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const [artImageUrl, setArtImageUrl] = useState("");
  const [showOnHome, setShowOnHome] = useState(true);

  // Debit also keeps optional network + last4 for the physical card look
  const [debitLast4, setDebitLast4] = useState("");

  // credit
  const [creditLimit, setCreditLimit] = useState("");
  const [last4, setLast4] = useState("");
  const [expDate, setExpDate] = useState("");
  const [network, setNetwork] = useState<CardNetwork>("visa");

  // investment sync
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncUrl, setSyncUrl] = useState("");
  const [syncToken, setSyncToken] = useState("");

  // fixed income
  const [annualRate, setAnnualRate] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [maturityDate, setMaturityDate] = useState("");
  const [isGoal, setIsGoal] = useState(false);
  const [goalTarget, setGoalTarget] = useState("");
  const [goalName, setGoalName] = useState("");

  const baseValid = institution.trim() && name.trim() && initialBalance !== "";
  const creditValid =
    type !== "credit" || (creditLimit !== "" && /^\d{4}$/.test(last4) && expDate);
  const fixedValid =
    type !== "fixed_income" ||
    (annualRate !== "" && startDate && (!isGoal || parseFloat(goalTarget || "0") > 0));
  const valid = !!(baseValid && creditValid && fixedValid);

  const submit = () => {
    if (!valid) return;
    const base = {
      type,
      institution: institution.trim(),
      name: name.trim(),
      currency,
      initialBalance: parseFloat(initialBalance),
      color,
      showOnHome,
      miniLabel:
        (type === "fixed_income" || type === "investment") && miniLabel.trim()
          ? miniLabel.trim().toUpperCase()
          : undefined,
      presetId: type === "debit" || type === "credit" ? presetId : undefined,
      artImageUrl:
        (type === "debit" || type === "credit") && artImageUrl.trim()
          ? artImageUrl.trim()
          : undefined,
    };
    if (type === "credit") {
      add({
        ...base,
        type: "credit",
        creditLimit: parseFloat(creditLimit),
        last4,
        expDate,
        network,
      } as Parameters<typeof add>[0]);
    } else if (type === "debit") {
      add({
        ...base,
        type: "debit",
        last4: debitLast4 || undefined,
        network: network,
      } as Parameters<typeof add>[0]);
    } else if (type === "fixed_income") {
      add({
        ...base,
        type: "fixed_income",
        annualRate: parseFloat(annualRate),
        startDate,
        maturityDate: maturityDate || undefined,
        isGoal: isGoal || undefined,
        goalTarget: isGoal ? parseFloat(goalTarget) : undefined,
        goalName: isGoal && goalName.trim() ? goalName.trim() : undefined,
      } as Parameters<typeof add>[0]);
    } else if (type === "investment") {
      add({
        ...base,
        type: "investment",
        syncUrl: syncEnabled && syncUrl.trim() ? syncUrl.trim() : undefined,
        syncToken: syncEnabled && syncToken.trim() ? syncToken.trim() : undefined,
      } as Parameters<typeof add>[0]);
    } else {
      add(base as Parameters<typeof add>[0]);
    }
    toast.success("Cuenta creada");
    router.push("/cuentas");
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="space-y-3">
        <Link
          href="/cuentas"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[-0.005em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver a cuentas
        </Link>
        <PageHeader
          eyebrow="Portafolio"
          title="Nueva Cuenta"
          subtitle="Configura los detalles y la apariencia de tu cuenta."
        />
      </div>

      <div className="md:grid md:grid-cols-12 md:gap-6 space-y-6 md:space-y-0">
        {/* Left column: Preview card + color (sticky on desktop) */}
        <div className="md:col-span-5 md:sticky md:top-6 md:self-start space-y-4">
          <div className="surface rounded-2xl p-5 space-y-4">
            <SectionHeading>Vista previa</SectionHeading>
            <AccountPreviewCard
              type={type}
              name={name}
              institution={institution}
              initialBalance={parseFloat(initialBalance || "0")}
              currency={currency}
              last4={type === "debit" ? debitLast4 : last4}
              network={network}
              annualRate={annualRate ? parseFloat(annualRate) : undefined}
              color={color}
              presetId={presetId}
              artImageUrl={artImageUrl}
            />
          </div>

          <div className="surface rounded-2xl p-5 space-y-4">
            <SectionHeading>Color de la tarjeta</SectionHeading>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {(type === "debit" || type === "credit") && (
            <div className="surface rounded-2xl p-5 space-y-4">
              <SectionHeading>Diseño de la tarjeta</SectionHeading>
              <CardPresetPicker
                value={presetId}
                onChange={(p) => setPresetId(p?.id)}
              />
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
        </div>

        {/* Right column: form */}
        <div className="md:col-span-7 space-y-4">
          {/* Account type selector */}
          <div className="surface rounded-2xl p-5 space-y-3">
            <SectionHeading>Tipo de cuenta</SectionHeading>
            <Tabs value={type} onValueChange={(v) => setType(v as AccountType)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="debit">Débito</TabsTrigger>
                <TabsTrigger value="credit">Crédito</TabsTrigger>
                <TabsTrigger value="fixed_income">Renta Fija</TabsTrigger>
                <TabsTrigger value="investment">Inversión</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Base details */}
          <div className="surface rounded-2xl p-5 space-y-4">
            <SectionHeading>Detalles de la cuenta</SectionHeading>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="institution">Institución</Label>
                <Input id="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre de la cuenta</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Moneda</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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

              {(type === "fixed_income" || type === "investment") && (
                <div className="space-y-1.5">
                  <Label htmlFor="mini-label">Etiqueta corta (opcional)</Label>
                  <Input
                    id="mini-label"
                    maxLength={5}
                    value={miniLabel}
                    onChange={(e) => setMiniLabel(e.target.value.toUpperCase())}
                    placeholder={type === "fixed_income" ? "Ej: NUB, CDT" : "Ej: IBKR, BTC"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Aparece dentro del mini-cuadro de color (máx. 5 caracteres).
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Type-specific details */}
          {type === "debit" && (
            <div className="surface rounded-2xl p-5 space-y-4">
              <SectionHeading>Tarjeta física (opcional)</SectionHeading>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Marca</Label>
                  <CardNetworkPicker value={network} onChange={setNetwork} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="debit-last4">Últimos 4 dígitos</Label>
                  <Input
                    id="debit-last4"
                    maxLength={4}
                    value={debitLast4}
                    onChange={(e) => setDebitLast4(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
            </div>
          )}

          {type === "credit" && (
            <div className="surface rounded-2xl p-5 space-y-4">
              <SectionHeading>Detalles de crédito</SectionHeading>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="limit">Límite de crédito</Label>
                  <Input id="limit" type="number" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="last4">Últimos 4 dígitos</Label>
                    <Input id="last4" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exp">Fecha de expiración</Label>
                    <Input id="exp" placeholder="MM/AA" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Red</Label>
                  <Select value={network} onValueChange={(v) => setNetwork(v as CardNetwork)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="mastercard">Mastercard</SelectItem>
                      <SelectItem value="amex">Amex</SelectItem>
                      <SelectItem value="other">Otra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {type === "fixed_income" && (
            <div className="surface rounded-2xl p-5 space-y-4">
              <SectionHeading>Detalles de renta fija</SectionHeading>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Tasa de interés anual (%)</Label>
                  <Input id="rate" type="number" inputMode="decimal" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start">Fecha de inicio</Label>
                    <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mat">Vencimiento (opcional)</Label>
                    <Input id="mat" type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
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
                        placeholder="Ej: Viaje a Europa, Casa propia"
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
                        placeholder="Ej: 10000000"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {type === "investment" && (
            <div className="surface rounded-2xl p-5 space-y-4">
              <SectionHeading>Sincronización (opcional)</SectionHeading>
              <div className="space-y-3">
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
                      <Label htmlFor="sync-url">URL Flex Query (SendRequest)</Label>
                      <Input
                        id="sync-url"
                        value={syncUrl}
                        onChange={(e) => setSyncUrl(e.target.value)}
                        placeholder="https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?q=QUERY_ID&v=3"
                      />
                      <p className="text-xs text-muted-foreground">
                        En IBKR: Reports → Flex Queries → copia la URL del SendRequest sin el token.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sync-token">Flex Token</Label>
                      <Input
                        id="sync-token"
                        type="password"
                        value={syncToken}
                        onChange={(e) => setSyncToken(e.target.value)}
                        placeholder="Token de IBKR Flex Web Service"
                      />
                      <p className="text-xs text-muted-foreground">
                        En IBKR: Settings → Account Settings → Flex Web Service → Generate Token.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Mostrar en Inicio</div>
              <div className="text-xs text-muted-foreground">
                {showOnHome ? "Aparece en la pantalla principal" : "Solo aparece en Cuentas"}
              </div>
            </div>
            <Switch checked={showOnHome} onCheckedChange={setShowOnHome} />
          </div>

          <Button disabled={!valid} onClick={submit} className="w-full h-12 text-base">
            Crear Cuenta
          </Button>
        </div>
      </div>
    </div>
  );
}
