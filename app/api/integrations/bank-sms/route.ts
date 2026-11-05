import { NextResponse } from "next/server";
import { withRetry } from "@/lib/db/retry";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findUserByToken, ingestSms } from "@/lib/integrations/bank-sms-server";

export const dynamic = "force-dynamic";

/**
 * Webhook for the iOS Shortcuts "Message" automation: every SMS from the bank
 * is POSTed here with a personal Bearer token (the Shortcut has no session
 * cookie). The body is JSON `{ "text": "<SMS>" }` or the SMS as plain text.
 * Responses always carry a human `message` the Shortcut can show as a
 * notification; handled outcomes (even unreadable SMS) answer 200 so it shows.
 */
const MAX_TEXT = 2000;

function reply(ok: boolean, message: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok, message, ...extra }, { status });
}

async function readText(req: Request): Promise<string | null> {
  const raw = await req.text();
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const body = JSON.parse(trimmed) as Record<string, unknown>;
      const value = body.text ?? body.message ?? body.body;
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export async function POST(req: Request) {
  const limit = rateLimit(`${clientIp(req)}:bank-sms`, 30, 60_000);
  if (!limit.ok) return reply(false, "Demasiadas solicitudes, intenta en un momento", 429);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(false, "Falta el token (encabezado Authorization)", 401);

  const text = await readText(req);
  if (!text) return reply(false, "No llegó el texto del mensaje", 400);
  if (text.length > MAX_TEXT) return reply(false, "El mensaje es demasiado largo", 413);

  const user = await withRetry(() => findUserByToken(token));
  if (!user) return reply(false, "Token inválido o revocado", 401);

  const result = await withRetry(() => ingestSms(user.id, text));
  return reply(result.status === "created" || result.status === "duplicate", result.message, result.status === "created" ? 201 : 200, {
    status: result.status,
    ...(result.status === "created" ? { transactions: result.transactions } : {}),
  });
}
