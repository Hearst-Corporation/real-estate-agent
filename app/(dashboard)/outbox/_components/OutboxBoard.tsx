"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Text } from "@/components/ui/text";

/** Vue publique d'un draft (miroir de OutboxDraftView, jamais de secret). */
export type DraftView = {
  id: string;
  lead_id: string | null;
  channel: "email" | "sms" | "whatsapp";
  subject: string | null;
  body: string;
  status: "draft" | "approved" | "sent" | "failed" | "canceled";
  provider: string | null;
  provider_ref: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

const STATUS_TABS = ["draft", "approved", "sent", "failed"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const STATUS_LABEL: Record<DraftView["status"], string> = {
  draft: "Brouillon",
  approved: "Validé",
  sent: "Envoyé",
  failed: "Échec",
  canceled: "Annulé",
};

const STATUS_TONE: Record<DraftView["status"], React.ComponentProps<typeof Badge>["color"]> = {
  draft: "zinc",
  approved: "amber",
  sent: "emerald",
  failed: "red",
  canceled: "zinc",
};

const CHANNEL_LABEL: Record<DraftView["channel"], string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

/** Message d'état lisible quand un envoi n'a pas eu lieu (CONFIG honnête). */
function reasonLabel(error: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case "provider_not_configured":
      return "Canal non configuré — aucun envoi, à traiter manuellement";
    case "provider_dry_run":
      return "Provider en mode dry-run — aucun envoi";
    case "send_failed":
      return "Échec d'envoi";
    default:
      return error;
  }
}

export function OutboxBoard({
  initial,
  unavailable,
}: {
  initial: DraftView[];
  unavailable: boolean;
}) {
  const [drafts, setDrafts] = useState<DraftView[]>(initial);
  const [tab, setTab] = useState<StatusTab>("draft");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of drafts) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [drafts]);

  const visible = drafts.filter((d) => d.status === tab);

  function upsert(next: DraftView) {
    setDrafts((prev) => prev.map((d) => (d.id === next.id ? next : d)));
  }

  async function call(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setFlash({ kind: "err", msg: String(json.error ?? `Erreur ${res.status}`) });
        return null;
      }
      return json;
    } catch {
      setFlash({ kind: "err", msg: "Réseau indisponible" });
      return null;
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    const json = await call(`/api/outbox/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    if (json?.draft) {
      upsert(json.draft as DraftView);
      setFlash({ kind: "ok", msg: "Brouillon validé" });
    }
    setBusyId(null);
  }

  async function cancel(id: string) {
    setBusyId(id);
    const json = await call(`/api/outbox/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel" }),
    });
    if (json?.draft) upsert(json.draft as DraftView);
    setBusyId(null);
  }

  async function send(id: string) {
    setBusyId(id);
    const json = await call(`/api/outbox/${id}/send`, { method: "POST" });
    if (json?.draft) {
      upsert(json.draft as DraftView);
      if (json.sent === true) {
        setFlash({ kind: "ok", msg: "Message envoyé" });
      } else if (json.degraded) {
        setFlash({ kind: "err", msg: String(json.info ?? "Aucun envoi effectué") });
      }
    }
    setBusyId(null);
  }

  function beginEdit(d: DraftView) {
    setEditId(d.id);
    setEditSubject(d.subject ?? "");
    setEditBody(d.body);
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    const json = await call(`/api/outbox/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        action: "edit",
        subject: editSubject.trim() ? editSubject.trim() : null,
        body: editBody,
      }),
    });
    if (json?.draft) {
      upsert(json.draft as DraftView);
      setEditId(null);
      setFlash({ kind: "ok", msg: "Brouillon enregistré" });
    }
    setBusyId(null);
  }

  if (unavailable) {
    return (
      <div className="surface flex flex-col items-start gap-2 p-6">
        <Badge color="amber">Indisponible</Badge>
        <Text>
          La table outbox n&apos;est pas encore déployée sur la base. La migration{" "}
          <code className="font-mono text-xs">0049_outbox.sql</code> doit être appliquée avant
          d&apos;utiliser les brouillons. Aucun message n&apos;est perdu.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {flash && (
        <div
          role="status"
          className={
            flash.kind === "ok"
              ? "surface border-l-4 border-emerald-500 p-3 text-sm text-emerald-800 dark:text-emerald-300"
              : "surface border-l-4 border-red-500 p-3 text-sm text-red-800 dark:text-red-300"
          }
        >
          {flash.msg}
        </div>
      )}

      {/* Onglets par statut */}
      <nav aria-label="Statuts" className="-mb-px flex flex-wrap items-center gap-1">
        {STATUS_TABS.map((s) => {
          const active = s === tab;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-md bg-accent-500/15 px-3 py-1.5 text-sm font-semibold text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-accent-300"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:hover:text-zinc-200"
              }
            >
              {STATUS_LABEL[s]}{" "}
              <span className="ml-1 text-xs tabular-nums text-zinc-400">{counts[s] ?? 0}</span>
            </button>
          );
        })}
      </nav>

      {/* Liste */}
      {visible.length === 0 ? (
        <div className="surface flex flex-col items-center gap-1 p-10 text-center">
          <Text className="font-medium">Aucun brouillon dans « {STATUS_LABEL[tab]} »</Text>
          <Text className="text-sm text-zinc-500">
            Les messages créés apparaissent ici avant tout envoi.
          </Text>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((d) => {
            const editing = editId === d.id;
            const busy = busyId === d.id;
            const reason = reasonLabel(d.error);
            return (
              <li key={d.id} className="surface flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  <Badge color="zinc">{CHANNEL_LABEL[d.channel]}</Badge>
                  {d.status === "sent" && d.sent_at && (
                    <span className="text-xs text-zinc-400">
                      envoyé le {new Date(d.sent_at).toLocaleString("fr-FR")}
                    </span>
                  )}
                  {d.provider_ref && (
                    <span className="text-xs text-zinc-400">réf. {d.provider_ref}</span>
                  )}
                </div>

                {editing ? (
                  <div className="flex flex-col gap-2">
                    {d.channel === "email" && (
                      <Input
                        aria-label="Objet"
                        placeholder="Objet"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                      />
                    )}
                    <Textarea
                      aria-label="Message"
                      rows={4}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button color="indigo" disabled={busy || !editBody.trim()} onClick={() => saveEdit(d.id)}>
                        {busy ? "…" : "Enregistrer"}
                      </Button>
                      <Button plain disabled={busy} onClick={() => setEditId(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {d.subject && <p className="font-medium text-zinc-900 dark:text-zinc-100">{d.subject}</p>}
                    <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{d.body}</p>
                  </div>
                )}

                {reason && (d.status === "approved" || d.status === "failed") && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{reason}</p>
                )}

                {/* Actions selon le statut */}
                {!editing && (
                  <div className="flex flex-wrap gap-2">
                    {(d.status === "draft" || d.status === "approved") && (
                      <Button plain disabled={busy} onClick={() => beginEdit(d)}>
                        Modifier
                      </Button>
                    )}
                    {d.status === "draft" && (
                      <Button color="indigo" disabled={busy} onClick={() => approve(d.id)}>
                        {busy ? "…" : "Valider"}
                      </Button>
                    )}
                    {d.status === "approved" && (
                      <Button color="indigo" disabled={busy} onClick={() => send(d.id)}>
                        {busy ? "Envoi…" : "Envoyer"}
                      </Button>
                    )}
                    {d.status === "failed" && (
                      <Button color="indigo" disabled={busy} onClick={() => send(d.id)}>
                        {busy ? "…" : "Réessayer"}
                      </Button>
                    )}
                    {(d.status === "draft" || d.status === "approved") && (
                      <Button plain disabled={busy} onClick={() => cancel(d.id)}>
                        Annuler
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
