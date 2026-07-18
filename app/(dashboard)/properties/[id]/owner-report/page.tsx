/**
 * /properties/[id]/owner-report — Tableau propriétaire (vue agent).
 *
 * Synthèse de la commercialisation d'un bien sous mandat, destinée à être
 * présentée/partagée au propriétaire. Tous les chiffres viennent de GPU1
 * (visites, diffusions, tâches). Aucune donnée inventée : une section sans
 * donnée affiche un état honnête (empty / UNAVAILABLE).
 *
 * Owner-check dur via `loadOwnerReport` (user_id + tenant_id). 404 sinon.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Card, PageStack, Caption } from "@/components/cockpit/primitives";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { eur, dateFr, dateTimeFr } from "@/lib/crm/format";
import { loadOwnerReport } from "@/lib/owner-report/load";
import type {
  ActivityBlock,
  FeedbackBlock,
  ActionsBlock,
} from "@/lib/owner-report/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OwnerReportPage({ params }: Props) {
  const { id } = await params;

  const claims = await getSession();
  if (!claims) notFound();

  const db = getGpu1Admin();
  if (!db) {
    return (
      <PageStack>
        <PageHeader kicker="Tableau propriétaire" title="Indisponible" />
        <Card>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            La base de données n&apos;est pas configurée. Réessayez plus tard.
          </p>
        </Card>
      </PageStack>
    );
  }

  const bundle = await loadOwnerReport(db, id, claims.sub, tenantOf(claims));
  if (!bundle) notFound();

  const { property, mandate, report } = bundle;
  const propertyTitle = property.title ?? property.address ?? "Bien";
  const location = [property.address, property.postal_code, property.city]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageStack>
      <PageHeader
        kicker="Tableau propriétaire"
        title={propertyTitle}
        action={
          <Link
            href={`/properties/${id}`}
            className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-zinc-400"
          >
            Retour à la fiche
          </Link>
        }
      />

      {/* Contexte bien + mandat */}
      <Card>
        <div className="flex flex-col gap-2">
          {location ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{location}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              Prix affiché&nbsp;: <strong className="text-zinc-900 dark:text-zinc-100">{eur(property.asking_price)}</strong>
            </span>
            {mandate ? (
              <span>
                Mandat {mandate.kind}
                {mandate.reference ? ` (${mandate.reference})` : ""} —{" "}
                <span className="capitalize">{mandate.status}</span>
                {mandate.signed_at ? ` · signé le ${dateFr(mandate.signed_at)}` : ""}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                Aucun mandat actif rattaché à ce bien
              </span>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivitySection activity={report.activity} />
        <ActionsSection actions={report.actions} />
      </div>

      <FeedbackSection feedback={report.feedback} />
    </PageStack>
  );
}

/* ── Activité ──────────────────────────────────────────────────────────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-950/[0.03] px-4 py-3 dark:bg-white/[0.04]">
      <div className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function ActivitySection({ activity }: { activity: ActivityBlock }) {
  return (
    <Card title="Activité de commercialisation" titleAs="section">
      {activity.empty ? (
        <p className="text-sm text-zinc-500">
          Aucune activité enregistrée pour ce bien pour l&apos;instant.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Visites" value={String(activity.visitsTotal)} />
            <Stat label="Réalisées" value={String(activity.visitsDone)} />
            <Stat label="À venir" value={String(activity.visitsUpcoming)} />
            <Stat label="Diffusions" value={String(activity.broadcastsTotal)} />
            <Stat label="En ligne" value={String(activity.broadcastsActive)} />
          </div>
          <Caption>
            {activity.lastActivityAt
              ? `Dernière activité : ${dateTimeFr(activity.lastActivityAt)}`
              : "Aucune date d'activité disponible"}
          </Caption>
        </>
      )}
    </Card>
  );
}

/* ── Prochaines actions ────────────────────────────────────────────────── */

function ActionsSection({ actions }: { actions: ActionsBlock }) {
  return (
    <Card title="Prochaines actions" titleAs="section">
      {actions.empty ? (
        <p className="text-sm text-zinc-500">
          Aucune action planifiée à venir sur ce bien.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-950/[0.06] dark:divide-white/[0.06]">
          {actions.items.map((a) => (
            <li key={`${a.source}-${a.id}`} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-zinc-800 dark:text-zinc-200">{a.label}</span>
              <span className="shrink-0 text-xs text-zinc-500">
                {a.at ? dateTimeFr(a.at) : "Sans échéance"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Retours de visite ─────────────────────────────────────────────────── */

function FeedbackSection({ feedback }: { feedback: FeedbackBlock }) {
  return (
    <Card title="Retours de visite" titleAs="section">
      {!feedback.available ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-zinc-500">
            Aucun compte-rendu de visite renseigné pour le moment.
          </p>
          {feedback.missingReports > 0 ? (
            <Caption>
              {feedback.missingReports} visite(s) réalisée(s) sans compte-rendu saisi.
            </Caption>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {feedback.items.map((f) => (
              <li
                key={f.visitId}
                className="rounded-lg border border-zinc-950/[0.06] bg-zinc-950/[0.02] p-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
              >
                <p className="whitespace-pre-line text-sm text-zinc-800 dark:text-zinc-200">
                  {f.text}
                </p>
                <div className="mt-1.5 text-xs text-zinc-500">{dateFr(f.at)}</div>
              </li>
            ))}
          </ul>
          {feedback.missingReports > 0 ? (
            <Caption>
              {feedback.missingReports} visite(s) réalisée(s) restent sans compte-rendu.
            </Caption>
          ) : null}
        </>
      )}
    </Card>
  );
}
