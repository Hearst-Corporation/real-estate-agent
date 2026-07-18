"use client";

/**
 * ActionCenter — « Que dois-je faire maintenant, pour qui, et pourquoi ? »
 *
 * Réunit des ActionItem DÉRIVÉES du réel (relances, RDV, estimations, matchs,
 * mandats, propriétaires…) et des tâches persistées (rea_tasks). Chaque item est
 * rattaché à une VRAIE entité → cliquable vers sa fiche.
 *
 * Actions rapides HONNÊTES :
 *   - appeler        → lien tel: réel
 *   - envoyer un message → crée une TÂCHE « message à envoyer » (rea_tasks LIVE) ;
 *     aucun transport branché → JAMAIS « envoyé », c'est un brouillon/à-faire tracé.
 *   - planifier      → ouvre la création de visite (/visits?new=1)
 *   - ouvrir la fiche
 *   - marquer traité / reporter → PATCH rea_tasks (LIVE)
 *   - demander une validation → crée une tâche kind=validation (rea_tasks LIVE)
 *
 * Palette : accent (or) + zinc uniquement (mono-accent, conforme check:catalyst).
 * L'urgence passe par la GRAISSE et l'icône, pas par une couleur d'alerte.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";
import { dateTimeFr, timeFr } from "@/lib/crm/format";
import type { ActionCategory, ActionItem, QuickAction } from "@/lib/actions/types";
import { BUCKET_ORDER, CATEGORY_ORDER, bucketOf, type TemporalBucket } from "@/lib/actions/derive";
import { DASHBOARD_ANCHORS } from "@/lib/onboarding/tours";

/**
 * Libellés des bandes temporelles (urgent → aujourd'hui → ensuite), injectés par
 * l'appelant depuis UI.* (aucun texte en dur ici). Réutilise des clés existantes.
 */
export type BucketLabels = Record<TemporalBucket, string>;

// ─── Métadonnées de catégorie (libellés via UI.*, icône mono-accent) ──────────

const CATEGORY_ICON: Record<ActionCategory, IconName> = {
  overdue: "agenda",
  today: "agenda",
  task: "mandates",
  validation: "leads",
  rdv: "visits",
  relance: "leads",
  proprietaire: "user",
  mandat: "mandates",
  estimation: "estimate",
  acquereur: "search",
  match: "network",
};

/** Icône d'action rapide. */
const QUICK_ICON: Record<QuickAction["kind"], IconName> = {
  call: "user",
  message: "leads",
  schedule: "visits",
  open: "chevron-right",
  done: "mandates",
  snooze: "agenda",
  validate: "mandates",
};

// ─── Sous-composants ──────────────────────────────────────────────────────────

/** Puce compacte de filtre catégorie — contrôle cockpit natif, accent/zinc. */
function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full border border-accent-500/40 bg-accent-500/15 px-3 py-1.5 text-xs font-semibold text-accent-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          : "inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-accent-500/30 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      }
    >
      <span className="truncate">{label}</span>
      <span
        className={
          active
            ? "tabular-nums text-accent-700"
            : "rounded-full bg-zinc-950/5 px-1.5 tabular-nums text-zinc-500"
        }
      >
        {count}
      </span>
    </button>
  );
}

/** Bouton d'action rapide compact (accent/zinc, focus visible). */
function QuickButton({
  icon,
  label,
  href,
  onClick,
  emphasis,
  busy,
}: {
  icon: IconName;
  label: string;
  href?: string;
  onClick?: () => void;
  emphasis?: boolean;
  busy?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-50";
  const tone = emphasis
    ? "bg-accent-500/12 text-accent-800 hover:bg-accent-500/20"
    : "text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900";
  const cls = `${base} ${tone}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        <Icon name={icon} className="size-4" />
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cls}
    >
      <Icon name={icon} className="size-4" />
      {busy ? UI.common.busy : label}
    </button>
  );
}

/** Une ligne d'action. */
function ActionRow({
  item,
  onQuick,
  busyId,
}: {
  item: ActionItem;
  onQuick: (item: ActionItem, action: QuickAction) => void;
  busyId: string | null;
}) {
  const t = UI.dashboard.center;
  const isBusy = busyId === item.id;
  const done = item.taskStatus === "done";

  const whenLabel =
    item.when != null
      ? item.category === "today"
        ? timeFr(item.when)
        : dateTimeFr(item.when)
      : null;

  return (
    <li
      className={`group flex flex-col gap-2 rounded-xl border px-4 py-3 transition-colors @lg:flex-row @lg:items-center @lg:gap-4 ${
        done
          ? "border-zinc-950/5 bg-zinc-950/2 opacity-60"
          : item.priority === "haute"
            ? "border-accent-500/25 bg-accent-500/5 hover:border-accent-500/40"
            : "border-zinc-950/8 bg-white hover:border-accent-500/25"
      }`}
    >
      {/* Icône + intitulé + raison (QUOI / POURQUOI) */}
      <Link
        href={item.href}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
            item.priority === "haute"
              ? "bg-accent-500/15 text-accent-700"
              : "bg-zinc-950/5 text-zinc-500"
          }`}
        >
          <Icon name={CATEGORY_ICON[item.category]} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={`block truncate text-sm text-zinc-900 group-hover:text-accent-800 ${
                item.priority === "haute" ? "font-semibold" : "font-medium"
              } ${done ? "line-through" : ""}`}
            >
              {item.title}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-xs text-zinc-500">{item.reason}</span>
            {whenLabel ? (
              <span className="shrink-0 text-xs font-medium text-accent-600 tabular-nums">
                {whenLabel}
              </span>
            ) : null}
          </span>
        </span>
      </Link>

      {/* Actions rapides */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 @lg:justify-end">
        {item.quick.map((qa, i) => {
          const key = `${qa.kind}:${i}`;
          if (qa.kind === "call") {
            return (
              <QuickButton
                key={key}
                icon={QUICK_ICON.call}
                label={t.quick.call}
                href={`tel:${qa.phone.replace(/\s+/g, "")}`}
              />
            );
          }
          if (qa.kind === "open") {
            return (
              <QuickButton key={key} icon={QUICK_ICON.open} label={t.quick.open} href={qa.href} />
            );
          }
          if (qa.kind === "message") {
            return (
              <QuickButton
                key={key}
                icon={QUICK_ICON.message}
                label={t.quick.message}
                onClick={() => onQuick(item, qa)}
                busy={isBusy}
              />
            );
          }
          if (qa.kind === "schedule") {
            return (
              <QuickButton
                key={key}
                icon={QUICK_ICON.schedule}
                label={t.quick.schedule}
                href="/visits?new=1"
              />
            );
          }
          if (qa.kind === "validate") {
            return (
              <QuickButton
                key={key}
                icon={QUICK_ICON.validate}
                label={t.quick.validate}
                onClick={() => onQuick(item, qa)}
                busy={isBusy}
              />
            );
          }
          if (qa.kind === "snooze") {
            return (
              <QuickButton
                key={key}
                icon={QUICK_ICON.snooze}
                label={t.quick.snooze}
                onClick={() => onQuick(item, qa)}
                busy={isBusy}
              />
            );
          }
          // done
          return (
            <QuickButton
              key={key}
              icon={QUICK_ICON.done}
              label={t.quick.done}
              emphasis
              onClick={() => onQuick(item, qa)}
              busy={isBusy}
            />
          );
        })}
      </div>
    </li>
  );
}

/** En-tête d'une bande temporelle — repère discret, compte à droite. */
function BucketHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center gap-2.5 first:mt-0">
      <span aria-hidden="true" className="h-px w-4 shrink-0 bg-accent-500/50" />
      <span className="text-xs font-semibold uppercase tracking-wider text-accent-700">
        {label}
      </span>
      <span className="tabular-nums text-xs font-medium text-zinc-400">{count}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-zinc-950/5" />
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

const SNOOZE_HOURS = 24; // report par défaut : +24 h

export function ActionCenter({
  items: initialItems,
  bucketLabels,
}: {
  items: ActionItem[];
  bucketLabels: BucketLabels;
}) {
  const t = UI.dashboard.center;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<ActionCategory | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Retrait optimiste local (une action traitée/reportée disparaît immédiatement).
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  const items = useMemo(
    () => initialItems.filter((i) => !removed.has(i.id)),
    [initialItems, removed],
  );

  const counts = useMemo(() => {
    const c = new Map<ActionCategory, number>();
    for (const i of items) c.set(i.category, (c.get(i.category) ?? 0) + 1);
    return c;
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.category === filter)),
    [items, filter],
  );

  const activeCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0),
    [counts],
  );

  // Regroupement temporel de la vue « Tout » : urgent → aujourd'hui → ensuite.
  // Les items arrivent DÉJÀ triés bande-first (buildActionCenter) → on ne fait
  // que partitionner, l'ordre interne est préservé. Filtre catégorie actif →
  // liste plate (l'utilisateur a explicitement restreint : pas de sur-découpage).
  const buckets = useMemo(() => {
    const map = new Map<TemporalBucket, ActionItem[]>();
    for (const b of BUCKET_ORDER) map.set(b, []);
    for (const i of visible) map.get(bucketOf(i.category))?.push(i);
    return BUCKET_ORDER.map((b) => ({ bucket: b, items: map.get(b) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [visible]);

  async function handleQuick(item: ActionItem, action: QuickAction) {
    setBusyId(item.id);
    setNotice(null);
    try {
      if (action.kind === "done" && item.taskId) {
        const res = await fetch(`/api/tasks/${item.taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "done" }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setRemoved((s) => new Set(s).add(item.id));
        setNotice(t.notices.done);
      } else if (action.kind === "snooze" && item.taskId) {
        const until = new Date(Date.now() + SNOOZE_HOURS * 3600 * 1000).toISOString();
        const res = await fetch(`/api/tasks/${item.taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "snooze", snoozed_until: until }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setRemoved((s) => new Set(s).add(item.id));
        setNotice(t.notices.snoozed);
      } else if (action.kind === "message") {
        // Honnête : aucun transport branché → on PERSISTE une tâche « message à
        // envoyer » (brouillon/à-faire). Jamais « envoyé ».
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: item.entity,
            entity_id: item.entityId,
            kind: "message",
            title: t.messageTaskTitle(item.title),
            priority: "normale",
            notes: t.messageTaskNote,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setNotice(t.notices.messageDrafted);
        startTransition(() => router.refresh());
      } else if (action.kind === "validate") {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: item.entity,
            entity_id: item.entityId,
            kind: "validation",
            title: t.validationTaskTitle(item.title),
            priority: "haute",
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setNotice(t.notices.validationRequested);
        startTransition(() => router.refresh());
      }
    } catch {
      setNotice(UI.common.networkError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      aria-label={t.title}
      // Ancre de visite guidée (REA-ONBOARDING-011). Ce bloc n'est monté que par
      // l'écran d'accueil : l'ancre y est donc unique dans le DOM.
      data-tour-id={DASHBOARD_ANCHORS.actionCenter}
      className="surface @container border-t-2 border-t-accent-500/50 bg-gradient-to-br from-accent-500/8 via-white to-white p-6 shadow-[var(--shadow-hero)] @2xl:p-7"
    >
      {/* En-tête */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700"
          >
            <Icon name="agenda" className="size-5" />
          </span>
          <div>
            <h2 className="font-titre text-xl font-semibold text-zinc-900">{t.title}</h2>
            <p className="text-xs text-zinc-500">{t.subtitle(items.length)}</p>
          </div>
        </div>
        {notice ? (
          <p
            role="status"
            className="rounded-lg bg-accent-500/10 px-3 py-1.5 text-xs font-medium text-accent-800"
          >
            {notice}
          </p>
        ) : null}
      </div>

      {/* Filtres par catégorie */}
      {activeCategories.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip
            active={filter === "all"}
            label={t.filterAll}
            count={items.length}
            onClick={() => setFilter("all")}
          />
          {activeCategories.map((c) => (
            <FilterChip
              key={c}
              active={filter === c}
              label={t.groups[c]}
              count={counts.get(c) ?? 0}
              onClick={() => setFilter(c)}
            />
          ))}
        </div>
      ) : null}

      {/* Liste */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-accent-500/20 px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-600"
          >
            <Icon name="mandates" className="size-6" />
          </span>
          <p className="text-sm font-medium text-zinc-700">{t.empty}</p>
          <p className="text-xs text-zinc-500">{t.emptyHint}</p>
        </div>
      ) : filter === "all" ? (
        // Vue « Tout » : bandes temporelles (urgent → aujourd'hui → ensuite).
        <div className="flex flex-col">
          {buckets.map((g) => (
            <section key={g.bucket} aria-label={bucketLabels[g.bucket]}>
              <BucketHeader label={bucketLabels[g.bucket]} count={g.items.length} />
              <ul className="flex flex-col gap-2">
                {g.items.map((item) => (
                  <ActionRow key={item.id} item={item} onQuick={handleQuick} busyId={busyId} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        // Filtre catégorie actif : liste plate (intention déjà restreinte).
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <ActionRow key={item.id} item={item} onQuick={handleQuick} busyId={busyId} />
          ))}
        </ul>
      )}
    </section>
  );
}
