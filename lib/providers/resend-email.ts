// Resend — emails alertes prospection. Dry-run si non configuré.
export function resendIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ id?: string; dry?: boolean }> {
  if (!resendIsConfigured()) return { dry: true };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from ?? process.env.RESEND_FROM ?? "alerte@real-estate-agent.app",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { id?: string };
  return { id: data.id };
}
