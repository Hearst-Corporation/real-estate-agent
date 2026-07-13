"use client";

import { useState } from "react";
import {
  BuildingOffice2Icon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/ui/dialog";
import { Field, Label } from "@/components/ui/fieldset";
import { Select } from "@/components/ui/select";
import { Subheading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Divider } from "@/components/ui/divider";
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from "@/components/ui/description-list";
import type { Annonce, Match } from "./types";

const t = UI.prospection;

// ── Helpers d'affichage (mêmes conventions que la page) ──────────────────────
function surfaceOf(a: Annonce): number | undefined {
  return a.surface_m2 ?? a.surface;
}
function piecesOf(a: Annonce): number | undefined {
  return a.nb_pieces ?? a.pieces;
}
function villeOf(a: Annonce): string | undefined {
  return a.commune ?? a.ville;
}
function photosOf(a: Annonce): string[] {
  return a.photos_urls ?? a.photos ?? [];
}
function titleOf(a: Annonce): string {
  return a.titre ?? a.type_bien ?? t.annonceNoTitle;
}
function providerOf(a: Annonce): string | undefined {
  return a.source_platform ?? a.source ?? undefined;
}

type Canal = "email" | "sms" | "whatsapp";

type ActionState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string; draft?: boolean }
  | { kind: "error"; message: string };

/** Feedback inline d'une action (success/error) — couleurs d'état via Badge. */
function ActionFeedback({ state }: { state: ActionState }) {
  if (state.kind === "success") {
    return (
      <div className="flex items-start gap-2 pt-1">
        <CheckCircleIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-indigo-500 dark:text-indigo-400"
        />
        <Text>
          {state.message}
          {state.draft ? ` ${t.actionContactDraftNotSent}` : ""}
        </Text>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex items-start gap-2 pt-1">
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
        />
        <Badge color="red">{UI.common.error}</Badge>
        <Text>{state.message}</Text>
      </div>
    );
  }
  return null;
}

/**
 * Détail annonce enrichi + actions CRM/contact/optout.
 * - `match` : optionnel — présent quand on ouvre depuis l'onglet matching
 *   (score + facteurs + valuation si l'API les expose).
 * - Après une action qui modifie l'annonce (link-crm/estimate/optout),
 *   `onChanged` demande au parent de rafraîchir sa liste.
 */
export function AnnonceDetailDialog({
  open,
  onClose,
  annonce,
  match,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  annonce: Annonce | null;
  match?: Match;
  onChanged?: () => void;
}) {
  const [canal, setCanal] = useState<Canal>("email");
  const [linkState, setLinkState] = useState<ActionState>({ kind: "idle" });
  const [estimateState, setEstimateState] = useState<ActionState>({ kind: "idle" });
  const [contactState, setContactState] = useState<ActionState>({ kind: "idle" });
  const [optoutState, setOptoutState] = useState<ActionState>({ kind: "idle" });
  // Copie locale des liens CRM (mise à jour optimiste après action réussie).
  const [links, setLinks] = useState<{ lead?: boolean; property?: boolean; estimation?: boolean }>(
    {},
  );

  if (!annonce) return null;

  const a = annonce;
  const surface = surfaceOf(a);
  const pieces = piecesOf(a);
  const ville = villeOf(a);
  const photos = photosOf(a);
  const provider = providerOf(a);
  const optedOut = a.demarchage_bloque === true;

  const hasLead = links.lead || Boolean(a.lead_id);
  const hasProperty = links.property || Boolean(a.property_id);
  const hasEstimation = links.estimation || Boolean(a.estimation_id);
  const anyBusy =
    linkState.kind === "loading" ||
    estimateState.kind === "loading" ||
    contactState.kind === "loading" ||
    optoutState.kind === "loading";

  async function callLinkCrm() {
    setLinkState({ kind: "loading" });
    try {
      const res = await fetch(`/api/prospection/annonces/${a.id}/link-crm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createLead: true, createProperty: true }),
      });
      await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinkState({ kind: "error", message: t.actionError });
        return;
      }
      setLinks((l) => ({ ...l, lead: true, property: true }));
      setLinkState({ kind: "success", message: t.actionLinkCrmDone });
      onChanged?.();
    } catch {
      setLinkState({ kind: "error", message: t.actionError });
    }
  }

  async function callEstimate() {
    setEstimateState({ kind: "loading" });
    try {
      const res = await fetch(`/api/prospection/annonces/${a.id}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstimateState({ kind: "error", message: t.actionError });
        return;
      }
      setLinks((l) => ({ ...l, estimation: true, property: true }));
      setEstimateState({ kind: "success", message: t.actionEstimateDone });
      onChanged?.();
    } catch {
      setEstimateState({ kind: "error", message: t.actionError });
    }
  }

  async function callContact() {
    setContactState({ kind: "loading" });
    try {
      const res = await fetch(`/api/prospection/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annonce_id: a.id,
          canal,
          template: t.actionContactTemplate(titleOf(a)),
          confirmed: false,
        }),
      });
      await res.json().catch(() => ({}));
      if (!res.ok) {
        setContactState({ kind: "error", message: t.actionError });
        return;
      }
      // confirmed:false ⇒ toujours un brouillon non envoyé.
      setContactState({ kind: "success", message: t.actionContactDone, draft: true });
    } catch {
      setContactState({ kind: "error", message: t.actionError });
    }
  }

  async function callOptout() {
    if (!confirm(t.actionOptoutConfirm)) return;
    setOptoutState({ kind: "loading" });
    try {
      const res = await fetch(`/api/prospection/optout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annonce_id: a.id, raison: "refus_demarchage" }),
      });
      await res.json().catch(() => ({}));
      if (!res.ok) {
        setOptoutState({ kind: "error", message: t.actionError });
        return;
      }
      setOptoutState({ kind: "success", message: t.actionOptoutDone });
      onChanged?.();
    } catch {
      setOptoutState({ kind: "error", message: t.actionError });
    }
  }

  const prixM2 =
    a.prix_m2 ?? (a.prix != null && surface ? Math.round(a.prix / surface) : undefined);

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>{t.detailTitle}</DialogTitle>
      <DialogBody>
        <div className="flex flex-col gap-6">
          {/* ── En-tête : visuel + provenance ── */}
          <div className="flex flex-wrap gap-4">
            <div className="relative aspect-[4/3] w-40 shrink-0 overflow-hidden rounded-xl bg-zinc-950/[0.02] dark:bg-white/[0.02]">
              {photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photos[0]}
                  alt={titleOf(a)}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <div
                  className="flex size-full items-center justify-center text-zinc-400 dark:text-zinc-600"
                  aria-hidden="true"
                >
                  <BuildingOffice2Icon className="size-10" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Strong>{titleOf(a)}</Strong>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge color="zinc">{t.detailProviderTag}</Badge>
                {provider && <Badge color="zinc">{provider}</Badge>}
                {optedOut && <Badge color="amber">{t.actionOptoutDone}</Badge>}
              </div>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {t.annonceVoir}
                  <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* ── Données normalisées ── */}
          <section>
            <Subheading>{t.detailSectionData}</Subheading>
            <DescriptionList className="mt-2">
              <DescriptionTerm>{t.detailFieldType}</DescriptionTerm>
              <DescriptionDetails>{a.type_bien ?? t.detailFieldNc}</DescriptionDetails>

              <DescriptionTerm>{t.detailFieldPrix}</DescriptionTerm>
              <DescriptionDetails>
                {a.prix != null
                  ? `${Number(a.prix).toLocaleString("fr-FR")} €`
                  : t.detailFieldNc}
              </DescriptionDetails>

              <DescriptionTerm>{t.detailFieldPrixM2}</DescriptionTerm>
              <DescriptionDetails>
                {prixM2 != null ? t.annoncePrixM2(prixM2) : t.detailFieldNc}
              </DescriptionDetails>

              <DescriptionTerm>{t.detailFieldSurface}</DescriptionTerm>
              <DescriptionDetails>
                {surface != null ? t.annonceSurface(surface) : t.detailFieldNc}
              </DescriptionDetails>

              <DescriptionTerm>{t.detailFieldPieces}</DescriptionTerm>
              <DescriptionDetails>
                {pieces != null ? t.annoncePieces(pieces) : t.detailFieldNc}
              </DescriptionDetails>

              <DescriptionTerm>{t.detailFieldVille}</DescriptionTerm>
              <DescriptionDetails>{ville ?? t.detailFieldNc}</DescriptionDetails>

              <DescriptionTerm>{t.detailFieldCp}</DescriptionTerm>
              <DescriptionDetails>{a.code_postal ?? t.detailFieldNc}</DescriptionDetails>

              <DescriptionTerm>{t.detailFieldDpe}</DescriptionTerm>
              <DescriptionDetails>{a.dpe_note ?? t.detailFieldNc}</DescriptionDetails>
            </DescriptionList>
          </section>

          {/* ── Score + valuation (si ouvert depuis un match) ── */}
          {match && (
            <>
              <Divider />
              <section>
                <Subheading>{t.detailScore}</Subheading>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    {t.scoreOutOf(match.score_match)}
                  </span>
                </div>
                <ValuationBlock match={match} annoncePrix={a.prix} />
              </section>
            </>
          )}
          {!match && (
            <>
              <Divider />
              <Text>{t.detailNoScore}</Text>
            </>
          )}

          {/* ── Rattachement CRM (données confirmées) ── */}
          <Divider />
          <section>
            <Subheading>{t.detailSectionCrm}</Subheading>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hasLead && <Badge color="indigo">{t.crmLeadLinked}</Badge>}
              {hasProperty && <Badge color="indigo">{t.crmPropertyLinked}</Badge>}
              {hasEstimation && <Badge color="indigo">{t.crmEstimationLinked}</Badge>}
              {!hasLead && !hasProperty && !hasEstimation && (
                <Text>{t.crmNothingLinked}</Text>
              )}
            </div>
          </section>

          {/* ── Actions ── */}
          <Divider />
          <section>
            <Subheading>{t.detailSectionActions}</Subheading>
            <div className="mt-3 flex flex-col gap-4">
              {/* Créer lead + bien */}
              <div>
                <Button
                  color="indigo"
                  disabled={anyBusy || (hasLead && hasProperty)}
                  onClick={callLinkCrm}
                >
                  {linkState.kind === "loading" ? t.actionLinkCrmDoing : t.actionLinkCrm}
                </Button>
                <ActionFeedback state={linkState} />
              </div>

              {/* Estimer */}
              <div>
                <Button outline disabled={anyBusy || hasEstimation} onClick={callEstimate}>
                  {estimateState.kind === "loading" ? t.actionEstimateDoing : t.actionEstimate}
                </Button>
                <ActionFeedback state={estimateState} />
              </div>

              {/* Préparer un contact */}
              <div className="flex flex-col gap-2">
                <Field className="max-w-xs">
                  <Label>{t.actionCanal}</Label>
                  <Select
                    value={canal}
                    disabled={anyBusy || optedOut}
                    onChange={(e) => setCanal(e.target.value as Canal)}
                  >
                    <option value="email">{t.actionCanalEmail}</option>
                    <option value="sms">{t.actionCanalSms}</option>
                    <option value="whatsapp">{t.actionCanalWhatsapp}</option>
                  </Select>
                </Field>
                <div>
                  <Button outline disabled={anyBusy || optedOut} onClick={callContact}>
                    {contactState.kind === "loading" ? t.actionContactDoing : t.actionContact}
                  </Button>
                  <ActionFeedback state={contactState} />
                </div>
              </div>

              {/* Opt-out */}
              <div>
                <Button plain disabled={anyBusy || optedOut} onClick={callOptout}>
                  {optoutState.kind === "loading" ? t.actionOptoutDoing : t.actionOptout}
                </Button>
                <ActionFeedback state={optoutState} />
              </div>
            </div>
          </section>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t.detailClose}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Bloc valuation : consomme match.valuation si l'API l'expose ──────────────
function ValuationBlock({
  match,
  annoncePrix,
}: {
  match: Match;
  annoncePrix?: number;
}) {
  const v = match.valuation;
  if (!v?.status || v.status === "unavailable") {
    return <Text className="mt-1">{t.valuationUnavailable}</Text>;
  }

  const statusLabel =
    v.status === "below_range"
      ? t.valuationBelow
      : v.status === "within_range"
        ? t.valuationWithin
        : v.status === "above_range"
          ? t.valuationAbove
          : t.valuationLowConfidence;

  // Opportunité (below) = accent ; surcoté / low_confidence = neutre.
  const badgeColor: "indigo" | "zinc" = v.status === "below_range" ? "indigo" : "zinc";

  const marketValue = v.marketValue ?? null;
  const deltaEur =
    marketValue != null && annoncePrix != null ? annoncePrix - marketValue : null;
  const deltaPct =
    marketValue != null && marketValue !== 0 && deltaEur != null
      ? Math.round((deltaEur / marketValue) * 1000) / 10
      : null;

  return (
    <div className="mt-3">
      <Text>{t.valuationTitle}</Text>
      <div className="mt-1.5 flex flex-col gap-1">
        <Badge color={badgeColor}>{statusLabel}</Badge>
        {marketValue != null && <Text>{t.valuationMarketValue(marketValue)}</Text>}
        {deltaEur != null && deltaPct != null && (
          <Text>{t.valuationDelta(deltaEur, deltaPct)}</Text>
        )}
      </div>
    </div>
  );
}
