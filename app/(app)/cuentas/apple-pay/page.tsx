"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, KeyRound, Smartphone } from "lucide-react";
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
import { cardKey } from "@/lib/integrations/apple-pay";
import type { PublicApplePayConfig } from "@/lib/integrations/apple-pay-server";

const NONE = "__none__";
const noopSubscribe = () => () => {};

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

export default function ApplePayPage() {
  const accounts = useAccountsStore((s) => s.activeAccounts);
  const cards = accounts.filter((a) => a.type === "debit" || a.type === "credit");
  const [config, setConfig] = useState<PublicApplePayConfig | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCard, setNewCard] = useState("");
  // Server render has no window; the URL appears once hydrated.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    fetch("/api/integrations/apple-pay/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setConfig)
      .catch(() => toast.error("No se pudo cargar la configuración de Apple Pay"));
  }, []);

  const call = async (method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/apple-pay/settings", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PublicApplePayConfig & { token?: string };
      if (data.token) setToken(data.token);
      setConfig(data);
      return true;
    } catch {
      toast.error("No se pudo guardar. Revisa tu conexión.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (config?.enabled && !confirm("Esto reemplaza el token actual: tendrás que actualizarlo en el atajo. ¿Continuar?")) return;
    await call("POST");
  };
  const revoke = async () => {
    if (!confirm("El atajo dejará de registrar pagos. ¿Revocar el token?")) return;
    if (await call("DELETE")) setToken(null);
  };
  const mapCard = (name: string, accountId: string) =>
    call("PATCH", { card: { name, accountId: accountId === NONE ? null : accountId } });

  const endpoint = `${origin}/api/integrations/apple-pay`;
  const cardNames = [
    ...new Set([
      ...(config?.seenCards ?? []),
      ...Object.keys(config?.cardMap ?? {}).filter(
        (key) => !(config?.seenCards ?? []).some((name) => cardKey(name) === key),
      ),
    ]),
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Cuentas"
          title="Apple Pay"
          subtitle="Cada pago con Apple Pay se registra solo como gasto, usando Atajos de iPhone."
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
            El atajo usa este token para guardar pagos en tu cuenta. Trátalo como una contraseña.
            {config?.lastEventAt && (
              <> Último pago recibido: {new Date(config.lastEventAt).toLocaleString("es-CO")}.</>
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
          <SectionHeading>2 · Crea la automatización en el iPhone</SectionHeading>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Abre <strong>Atajos</strong> → pestaña <strong>Automatización</strong> → <strong>+</strong>.</li>
            <li>Elige <strong>Transacción</strong>, marca todas tus tarjetas de Wallet y deja todas las categorías.</li>
            <li>Selecciona <strong>Ejecutar inmediatamente</strong> (y desactiva &quot;Notificar al ejecutar&quot; si quieres) → <strong>Siguiente</strong> → <strong>Nueva automatización en blanco</strong>.</li>
            <li>
              Agrega la acción <strong>Obtener contenido de URL</strong>:
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>URL: la de arriba.</li>
                <li>Método: <strong>POST</strong>.</li>
                <li>Encabezados: clave <code>Authorization</code>, valor <code>Bearer cof_…</code> (el token).</li>
                <li>
                  Cuerpo de la solicitud: <strong>JSON</strong> con tres campos de texto:{" "}
                  <code>amount</code> = variable <em>Monto</em>, <code>merchant</code> = <em>Comercio</em>,{" "}
                  <code>card</code> = <em>Tarjeta o pase</em>.
                </li>
              </ul>
            </li>
            <li>
              (Opcional) Agrega <strong>Obtener valor del diccionario</strong> con la clave <code>message</code> y luego{" "}
              <strong>Mostrar notificación</strong> para ver &quot;Guardado: …&quot; tras cada pago.
            </li>
            <li>Paga algo con Apple Pay: el gasto aparece aquí y su tarjeta en la lista de abajo.</li>
          </ol>
        </section>

        <section className="surface space-y-4 rounded-2xl p-5">
          <SectionHeading>3 · ¿A qué cuenta va cada tarjeta?</SectionHeading>
          <p className="text-sm text-muted-foreground">
            Si el nombre de la tarjeta en Wallet coincide con el nombre, el banco o los últimos 4 dígitos de una cuenta,
            se asigna sola. Si no, elige aquí. Las tarjetas aparecen después de su primer pago.
          </p>

          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-muted-foreground">Cuenta por defecto (si no se reconoce la tarjeta)</div>
            <Select
              value={config?.defaultAccountId ?? NONE}
              onValueChange={(v) => call("PATCH", { defaultAccountId: v === NONE ? null : v })}
              disabled={busy || !config}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ninguna (rechazar el pago)</SelectItem>
                {cards.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {cardNames.length > 0 && (
            <div className="divide-y overflow-hidden rounded-xl border">
              {cardNames.map((name) => (
                <div key={name} className="flex items-center gap-3 px-3 py-2.5">
                  <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <div className="w-44 shrink-0">
                    <Select
                      value={config?.cardMap[cardKey(name)] ?? NONE}
                      onValueChange={(v) => mapCard(name, v)}
                      disabled={busy}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Automático</SelectItem>
                        {cards.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCard.trim();
              if (!name) return;
              setConfig((c) => (c && !c.seenCards.includes(name) ? { ...c, seenCards: [...c.seenCards, name] } : c));
              setNewCard("");
            }}
          >
            <Input
              value={newCard}
              onChange={(e) => setNewCard(e.target.value)}
              placeholder="Nombre de la tarjeta en Wallet"
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newCard.trim()}>
              Agregar
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
