// Twilio WhatsApp — alertes prospection. Dry-run si non configuré.
const BASE = "https://api.twilio.com/2010-04-01";

export function twilioIsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

export async function sendWhatsApp(to: string, body: string): Promise<{ sid?: string; dry?: boolean }> {
  if (!twilioIsConfigured()) return { dry: true };

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;

  const res = await fetch(`${BASE}/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      Body: body,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { sid?: string };
  return { sid: data.sid };
}

export async function sendSms(to: string, body: string): Promise<{ sid?: string; dry?: boolean }> {
  if (!twilioIsConfigured()) return { dry: true };

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_WHATSAPP_FROM!;

  const res = await fetch(`${BASE}/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Twilio SMS ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { sid?: string };
  return { sid: data.sid };
}
