"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, CreditCard, KeyRound, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, SectionHeading } from "@/components/nav/page-header";
import { useAccountsStore } from "@/lib/store/accounts";
import { useTransactionsStore } from "@/lib/store/transactions";
import type { PublicBankSmsConfig } from "@/lib/integrations/bank-sms-server";

const AUTO = "__auto__";
const noopSubscribe = () => () => {};

type Config = PublicBankSmsConfig & { token?: string; message?: string };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar, selecciónalo manualmente");
    }
  };
  return (
    <div className="space-y-1">
      <div className="text-[12px] font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 text-[12px]">{value}</code>
        <Button variant="outline" size="icon" onClick={copy} aria-label={`Copiar ${label}`}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function BankMessagesPage() {
  const accounts = useAccountsStore((s) => s.activeAccounts);
  const cards = accounts.filter((a) => a.type === "debit" || a.type === "credit");
  // Fiducuenta, CDT and investments also show up in bank SMS (deposits, withdrawals).
  const savings = accounts.filter((a) => a.type === "fixed_income" || a.type === "investment");
  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newLast4, setNewLast4] = useState("");
  // Server render has no window; the URL appears once hydrated.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    fetch("/api/integrations/bank-sms/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setConfig)
      .catch(() => toast.error("No se pudo cargar la configuración"));
  }, []);

  const call = async (method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<Config | null> => {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/bank-sms/settings", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Config;
      if (data.token) setToken(data.token);
      setConfig(data);
      return data;
    } catch {
      toast.error("No se pudo guardar. Revisa tu conexión.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (config?.enabled && !confirm("Esto reemplaza el token actual: tendrás que actualizarlo en el atajo. ¿Continuar?")) return;
    await call("POST");
  };
  const revoke = async () => {
    if (!confirm("El atajo dejará de registrar movimientos. ¿Revocar el token?")) return;
    if (await call("DELETE")) setToken(null);
  };
  const mapProduct = (last4: string, value: string) =>
    call("PATCH", { product: { last4, accountId: value === AUTO ? null : value } });
  const retry = async (id: string) => {
    const data = await call("PATCH", { retryPendingId: id });
    if (!data) return;
    const stillPending = data.pending.some((p) => p.text === config?.pending.find((x) => x.id === id)?.text);
    if (stillPending) toast.error(data.message ?? "Sigue sin poder registrarse");
    else {
      toast.success(data.message ?? "Registrado");
      void useTransactionsStore.getState().pullNew();
    }
  };

  const endpoint = `${origin}/api/integrations/bank-sms`;
  const accountName = (id: string | undefined) => accounts.find((a) => a.id === id)?.name;
  const autoMatch = (last4: string) => {
    const matches = cards.filter((a) => "last4" in a && a.last4 === last4);
    return matches.length === 1 ? matches[0].name : null;
  };
  const products = [...new Set([...(config?.seenProducts ?? []), ...Object.keys(config?.accountMap ?? {})])].sort();

  return (
    <div className="p-4 md:p-8">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Cuentas"
          title="Mensajes del banco"
          subtitle="Cada SMS de Bancolombia se registra solo como movimiento, usando Atajos de iPhone."
        >
          <Link href="/cuentas">
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowLeft className="size-4" /> Cuentas
            </Button>
          </Link>
        </PageHeader>

        <section className="surface space-y-4 rounded-2xl p-5">
          <SectionHeading
            right={
              config && (
                <Badge variant={config.enabled ? "default" : "secondary"}>
                  {config.enabled ? "Conectado" : "Sin conectar"}
                </Badge>
              )
            }
          >
            1 · Token personal
          </SectionHeading>
          <p className="text-sm text-muted-foreground">
            El atajo usa este token para guardar movimientos en tu cuenta. Trátalo como una contraseña.
            {config?.lastEventAt && (
              <> Último mensaje recibido: {new Date(config.lastEventAt).toLocaleString("es-CO")}.</>
            )}
          </p>
          {origin && <CopyField label="URL" value={endpoint} />}
          {token ? (
            <>
              <CopyField label="Authorization" value={`Bearer ${token}`} />
              <p className="text-[12px] text-amber-600 dark:text-amber-400">
                Cópialo ahora: por seguridad no se vuelve a mostrar.
              </p>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1" onClick={generate} disabled={busy || !config}>
              <KeyRound className="size-4" /> {config?.enabled ? "Generar token nuevo" : "Generar token"}
            </Button>
            {config?.enabled && (
              <Button size="sm" variant="outline" onClick={revoke} disabled={busy}>
                Revocar
              </Button>
            )}
          </div>
        </section>

        <section className="surface space-y-3 rounded-2xl p-5">
          <SectionHeading>2 · Automatización en el iPhone</SectionHeading>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Abre <strong>Atajos</strong> → <strong>Automatización</strong> → <strong>+</strong> → <strong>Mensaje</strong>.
            </li>
            <li>
              En <strong>El mensaje contiene</strong> escribe <code>Bancolombia</code> y elige <strong>Ejecutar inmediatamente</strong>.
            </li>
            <li>
              <strong>Siguiente</strong> → <strong>Nueva automatización en blanco</strong> y agrega <strong>Obtener contenido de URL</strong>:
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>URL: la de arriba.</li>
                <li>Método: <strong>POST</strong>.</li>
                <li>
                  Encabezados: clave <code>Authorization</code>, valor <code>Bearer cof_…</code> (el token).
                </li>
                <li>
                  Cuerpo de la solicitud: <strong>JSON</strong> con un campo de texto <code>text</code> = variable{" "}
                  <em>Entrada del atajo</em> (Contenido).
                </li>
              </ul>
            </li>
            <li>
              Agrega <strong>Obtener valor del diccionario</strong> con la clave <code>message</code> y luego{" "}
              <strong>Mostrar notificación</strong> con ese valor, para ver &quot;Gasto: $9.900 · …&quot; tras cada mensaje.
            </li>
            <li>
              Si ya tenías la automatización de prueba, solo cambia su acción <strong>Mostrar notificación</strong> por estos pasos.
            </li>
          </ol>
        </section>

        <section className="surface space-y-4 rounded-2xl p-5">
          <SectionHeading>3 · ¿A qué cuenta va cada producto?</SectionHeading>
          <p className="text-sm text-muted-foreground">
            Los mensajes dicen los últimos 4 dígitos (*8761, *0560…). Si una tarjeta o cuenta tiene esos dígitos guardados,
            se asigna sola. Si no, elígela aquí, incluidas Fiducuenta, CDT e inversiones. Si el número es de una cuenta
            tuya que recibe dinero (por ejemplo, la cuenta a la que retiras de la Fiducuenta), asígnalo también para que
            quede como traslado. Los números aparecen después del primer mensaje, o agrégalos tú.
          </p>

          {products.length > 0 && (
            <div className="divide-y overflow-hidden rounded-xl border">
              {products.map((last4) => {
                const auto = autoMatch(last4);
                return (
                  <div key={last4} className="flex items-center gap-3 px-3 py-2.5">
                    <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm tabular-nums">*{last4}</span>
                    <div className="w-44 shrink-0">
                      <Select
                        value={config?.accountMap[last4] ?? AUTO}
                        onValueChange={(v) => mapProduct(last4, v)}
                        disabled={busy}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO}>{auto ? `Automático (${auto})` : "Sin asignar"}</SelectItem>
                          {[...cards, ...savings].map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const last4 = newLast4.trim();
              if (!/^\d{4}$/.test(last4)) return;
              setNewLast4("");
              void call("PATCH", { addProduct: last4 });
            }}
          >
            <Input
              value={newLast4}
              onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="Últimos 4 dígitos"
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!/^\d{4}$/.test(newLast4)}>
              Agregar
            </Button>
          </form>
        </section>

        {config && config.pending.length > 0 && (
          <section className="surface space-y-4 rounded-2xl p-5">
            <SectionHeading right={<Badge variant="secondary">{config.pending.length}</Badge>}>
              Pendientes por revisar
            </SectionHeading>
            <p className="text-sm text-muted-foreground">
              Mensajes que no se pudieron registrar. Asigna la cuenta arriba y toca reintentar, o descártalos.
            </p>
            <div className="divide-y overflow-hidden rounded-xl border">
              {config.pending.map((p) => (
                <div key={p.id} className="space-y-2 px-3 py-3">
                  <p className="text-[13px] leading-snug">{p.text}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[12px] text-amber-600 dark:text-amber-400">
                      {p.reason}
                      {p.last4 && accountName(config.accountMap[p.last4]) && ` · ahora asignado a ${accountName(config.accountMap[p.last4])}`}
                    </span>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => retry(p.id)} disabled={busy}>
                      <RotateCw className="size-3.5" /> Reintentar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => call("PATCH", { dismissPendingId: p.id })}
                      disabled={busy}
                    >
                      <X className="size-3.5" /> Descartar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
