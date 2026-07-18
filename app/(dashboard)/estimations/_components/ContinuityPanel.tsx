"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";
import {
  DECISIONS,
  type ContinuityState,
  type Decision,
  type ManualAdjustment,
} from "@/lib/estimation/continuity";
import { computeValueClarity } from "@/lib/estimation/clarity";
import type {
  Valuation,
  PropertyData,
  FieldStatusMap,
} from "@/lib/estimation/types";

const t = UI.estimations.continuity;

const fmtEur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

type Props = {
  id: string;
  initialContinuity: ContinuityState;
  valuation: Valuation;
  property: PropertyData;
  fieldStatus: FieldStatusMap;
};

type AdjustUnit = "pct" | "eur";
type OwnerMode = "create" | "link";
type VendeurLead = { id: string; full_name: string; email: string | null; phone: string | null };

/**
 * Un jalon du pipeline commercial.
 *
 * Responsive : en dessous de `@sm` (≈ mobile, la colonne de contenu fait
 * ~343 px), les jalons s'empilent en grille 2×2 sans filet de liaison — les 4
 * restent lisibles, aucun débordement (le « Décision » ne sort plus du cadre).
 * À partir de `@sm`, on retrouve la frise horizontale connectée. Le jalon
 * `current` (premier non fait) porte un anneau accent : l'agent voit où agir.
 */
function PipelineStep({
  label,
  done,
  current,
  first,
}: {
  label: string;
  done: boolean;
  current?: boolean;
  first?: boolean;
}) {
  const stateLabel = done ? t.stepDone : t.stepTodo;
  return (
    <div className="flex items-center gap-2 @sm:flex-1">
      {!first && (
        <span
          aria-hidden="true"
          className={`hidden h-px flex-1 @sm:block ${done ? "bg-accent-400" : "bg-zinc-950/10"}`}
        />
      )}
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            done
              ? "bg-accent-500 text-zinc-950"
              : current
                ? "border-2 border-accent-500 bg-accent-500/10 text-accent-700"
                : "border border-zinc-950/15 bg-white text-zinc-400"
          }`}
        >
          {done ? "✓" : "○"}
        </span>
        <span
          className={`truncate text-xs font-semibold ${
            done ? "text-zinc-900" : current ? "text-accent-700" : "text-zinc-500"
          }`}
        >
          {label}
          <span className="sr-only"> — {stateLabel}</span>
        </span>
      </div>
    </div>
  );
}

/** Formatte la magnitude d'un ajustement manuel (pct ou €), signe inclus. */
function adjustMagnitude(a: ManualAdjustment): string {
  if (a.pct != null && a.pct !== 0) {
    const sign = a.pct > 0 ? "+" : "−";
    return `${sign}${Math.abs(a.pct)} %`;
  }
  if (a.eur != null && a.eur !== 0) {
    const sign = a.eur > 0 ? "+" : "−";
    return `${sign}${fmtEur.format(Math.abs(a.eur))}`;
  }
  return "—";
}

export function ContinuityPanel({
  id,
  initialContinuity,
  valuation,
  property,
  fieldStatus,
}: Props) {
  const [continuity, setContinuity] = useState<ContinuityState>(initialContinuity);

  // ── Formulaires ──
  const [ownerFormOpen, setOwnerFormOpen] = useState(false);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("create");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [vendeurLeads, setVendeurLeads] = useState<VendeurLead[]>([]);
  const [pickedLeadId, setPickedLeadId] = useState("");

  const [mandateBusy, setMandateBusy] = useState(false);
  const [mandateError, setMandateError] = useState<string | null>(null);

  const [decision, setDecision] = useState<Decision | "">(
    initialContinuity.decision ?? ""
  );
  const [nextAction, setNextAction] = useState(initialContinuity.nextAction ?? "");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<"saved" | "error" | null>(null);

  const [adjFormOpen, setAdjFormOpen] = useState(false);
  const [adjLabel, setAdjLabel] = useState("");
  const [adjUnit, setAdjUnit] = useState<AdjustUnit>("pct");
  const [adjValue, setAdjValue] = useState("");
  const [adjRaison, setAdjRaison] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // ── Dérivés ──
  const calculated = valuation.adjustments ?? [];
  const manual = continuity.manualAdjustments;
  const clarity = computeValueClarity(property, fieldStatus);

  const hasOwner = continuity.owner != null;
  const hasMandate = continuity.mandate != null;
  const hasDecision =
    continuity.decision != null && continuity.decision !== "en_attente";

  // Prochain jalon à traiter (le 1ᵉʳ non fait) → guide l'agent vers l'action
  // commerciale suivante. Séquence : propriétaire → opportunité → décision.
  const pipelineCurrent: "owner" | "mandate" | "decision" | null = !hasOwner
    ? "owner"
    : !hasMandate
      ? "mandate"
      : !hasDecision
        ? "decision"
        : null;

  // ── Actions ──
  async function openOwnerForm() {
    setOwnerFormOpen(true);
    setOwnerError(null);
    // Précharge les vendeurs existants pour le mode « lier ».
    try {
      const res = await fetch(`/api/estimations/${id}/owner`, { method: "GET" });
      if (res.ok) {
        const data = (await res.json()) as { leads?: VendeurLead[] };
        setVendeurLeads(data.leads ?? []);
      }
    } catch {
      // le mode « créer » reste disponible même si la liste échoue.
    }
  }

  async function submitOwner() {
    if (ownerBusy) return;
    setOwnerError(null);

    let body: Record<string, unknown>;
    if (ownerMode === "link") {
      if (!pickedLeadId) {
        setOwnerError(t.ownerNameRequired);
        return;
      }
      body = { mode: "link", lead_id: pickedLeadId };
    } else {
      const name = ownerName.trim();
      if (!name) {
        setOwnerError(t.ownerNameRequired);
        return;
      }
      body = {
        mode: "create",
        full_name: name,
        email: ownerEmail.trim() || null,
        phone: ownerPhone.trim() || null,
        notes: ownerNotes.trim() || null,
      };
    }

    setOwnerBusy(true);
    try {
      const res = await fetch(`/api/estimations/${id}/owner`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        continuity?: ContinuityState;
      };
      if (!res.ok || !data.continuity) throw new Error("failed");
      setContinuity(data.continuity);
      setOwnerFormOpen(false);
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPhone("");
      setOwnerNotes("");
      setPickedLeadId("");
    } catch {
      setOwnerError(t.ownerError);
    } finally {
      setOwnerBusy(false);
    }
  }

  async function createMandate() {
    if (mandateBusy) return;
    setMandateError(null);
    setMandateBusy(true);
    try {
      const res = await fetch(`/api/estimations/${id}/mandate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "simple" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        continuity?: ContinuityState;
      };
      if (!res.ok || !data.continuity) throw new Error("failed");
      setContinuity(data.continuity);
    } catch {
      setMandateError(t.mandateError);
    } finally {
      setMandateBusy(false);
    }
  }

  async function saveDecision() {
    if (decisionBusy) return;
    setDecisionMsg(null);
    setDecisionBusy(true);
    try {
      const res = await fetch(`/api/estimations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          decision
            ? { action: "decision", decision, next_action: nextAction.trim() || null }
            : { action: "next_action", next_action: nextAction.trim() || null }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        continuity?: ContinuityState;
      };
      if (!res.ok || !data.continuity) throw new Error("failed");
      setContinuity(data.continuity);
      setDecisionMsg("saved");
    } catch {
      setDecisionMsg("error");
    } finally {
      setDecisionBusy(false);
    }
  }

  async function submitAdjustment() {
    if (adjBusy) return;
    setAdjError(null);
    const label = adjLabel.trim();
    const raison = adjRaison.trim();
    const num = Number(adjValue.replace(",", "."));
    if (!label) {
      setAdjError(t.adjustLabelRequired);
      return;
    }
    if (!Number.isFinite(num) || num === 0) {
      setAdjError(t.adjustValueRequired);
      return;
    }
    if (!raison) {
      setAdjError(t.adjustRaisonRequired);
      return;
    }
    setAdjBusy(true);
    try {
      const res = await fetch(`/api/estimations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "add_adjustment",
          label,
          raison,
          ...(adjUnit === "pct" ? { pct: num } : { eur: num }),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        continuity?: ContinuityState;
      };
      if (!res.ok || !data.continuity) throw new Error("failed");
      setContinuity(data.continuity);
      setAdjFormOpen(false);
      setAdjLabel("");
      setAdjValue("");
      setAdjRaison("");
    } catch {
      setAdjError(t.adjustError);
    } finally {
      setAdjBusy(false);
    }
  }

  async function removeAdjustment(adjustmentId: string) {
    if (removingId) return;
    setRemovingId(adjustmentId);
    try {
      const res = await fetch(`/api/estimations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove_adjustment", adjustment_id: adjustmentId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        continuity?: ContinuityState;
      };
      if (res.ok && data.continuity) setContinuity(data.continuity);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── En-tête + pipeline ── */}
      <div className="surface flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <Subheading className="font-titre">{t.title}</Subheading>
          <Text className="mt-1 !text-sm">{t.subtitle}</Text>
        </div>
        {/* Mobile : grille 2×2 (tous les jalons visibles). @sm+ : frise connectée. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 @sm:flex @sm:items-center @sm:gap-1">
          <PipelineStep label={t.pipelineEstimation} done first />
          <PipelineStep label={t.pipelineOwner} done={hasOwner} current={pipelineCurrent === "owner"} />
          <PipelineStep label={t.pipelineOpportunity} done={hasMandate} current={pipelineCurrent === "mandate"} />
          <PipelineStep label={t.pipelineDecision} done={hasDecision} current={pipelineCurrent === "decision"} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        {/* ── Propriétaire ── */}
        <section className="surface flex flex-col gap-3 p-5">
          <Subheading className="font-titre">{t.ownerTitle}</Subheading>

          {hasOwner && continuity.owner ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-950">
                  {continuity.owner.full_name}
                </span>
                <Badge color="zinc">{t.ownerKindBadge}</Badge>
              </div>
              {(continuity.owner.email || continuity.owner.phone) && (
                <p className="text-sm text-zinc-500">
                  {[continuity.owner.email, continuity.owner.phone]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <div className="mt-1">
                <Button outline href={`/leads/${continuity.owner.id}`}>
                  <Icon name="leads" data-slot="icon" />
                  {t.ownerOpen}
                </Button>
              </div>
            </div>
          ) : ownerFormOpen ? (
            <div className="flex flex-col gap-3">
              {/* Bascule créer / lier un existant */}
              <div className="inline-flex w-fit rounded-lg border border-zinc-950/10 p-0.5">
                {ownerMode === "create" ? (
                  <Button color="indigo" className="!py-1 !text-xs !text-zinc-950">
                    {t.ownerModeCreate}
                  </Button>
                ) : (
                  <Button plain className="!py-1 !text-xs" onClick={() => setOwnerMode("create")}>
                    {t.ownerModeCreate}
                  </Button>
                )}
                {ownerMode === "link" ? (
                  <Button color="indigo" className="!py-1 !text-xs !text-zinc-950">
                    {t.ownerModeLink}
                  </Button>
                ) : (
                  <Button plain className="!py-1 !text-xs" onClick={() => setOwnerMode("link")}>
                    {t.ownerModeLink}
                  </Button>
                )}
              </div>

              {ownerMode === "link" ? (
                vendeurLeads.length === 0 ? (
                  <Text className="!text-sm">{t.ownerLinkEmpty}</Text>
                ) : (
                  <Field>
                    <Label>{t.ownerPickLabel}</Label>
                    <Select
                      value={pickedLeadId}
                      onChange={(e) => setPickedLeadId(e.target.value)}
                    >
                      <option value="">{t.ownerPickPlaceholder}</option>
                      {vendeurLeads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )
              ) : (
                <>
                  <Field>
                    <Label>{t.ownerNameLabel}</Label>
                    <Input
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder={t.ownerNamePlaceholder}
                      autoFocus
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field>
                      <Label>{t.ownerEmailLabel}</Label>
                      <Input
                        type="email"
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        placeholder={t.ownerEmailPlaceholder}
                      />
                    </Field>
                    <Field>
                      <Label>{t.ownerPhoneLabel}</Label>
                      <Input
                        value={ownerPhone}
                        onChange={(e) => setOwnerPhone(e.target.value)}
                        placeholder={t.ownerPhonePlaceholder}
                      />
                    </Field>
                  </div>
                  <Field>
                    <Label>{t.ownerNotesLabel}</Label>
                    <Textarea
                      rows={2}
                      value={ownerNotes}
                      onChange={(e) => setOwnerNotes(e.target.value)}
                      placeholder={t.ownerNotesPlaceholder}
                    />
                  </Field>
                  <p className="text-xs text-zinc-500">{t.ownerLinkedNote}</p>
                </>
              )}

              {ownerError && <ErrorMessage>{ownerError}</ErrorMessage>}
              <div className="flex flex-wrap gap-2">
                <Button
                  color="indigo"
                  className="!text-zinc-950 hover:!text-zinc-950"
                  onClick={submitOwner}
                  disabled={ownerBusy || (ownerMode === "link" && vendeurLeads.length === 0)}
                >
                  {ownerBusy
                    ? t.ownerCreating
                    : ownerMode === "link"
                      ? t.ownerLinkCta
                      : t.ownerCreateCta}
                </Button>
                <Button plain onClick={() => setOwnerFormOpen(false)} disabled={ownerBusy}>
                  {t.ownerCancel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Text className="!text-sm">{t.ownerNone}</Text>
              <div>
                {/* CTA primaire : rattacher le propriétaire est l'étape naturelle
                    juste après l'estimation → même poids visuel que « créer le mandat ». */}
                <Button
                  color="indigo"
                  className="!text-zinc-950 hover:!text-zinc-950"
                  onClick={openOwnerForm}
                >
                  <Icon name="plus" data-slot="icon" />
                  {t.ownerAttachCta}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* ── Opportunité de mandat ── */}
        <section className="surface flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <Subheading className="font-titre">{t.mandateTitle}</Subheading>
            {hasMandate && <Badge color="amber">{t.mandateDraftBadge}</Badge>}
          </div>

          {hasMandate && continuity.mandate ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-zinc-500">{t.mandateAskingLabel}</span>
                <span className="font-semibold text-zinc-950 tabular-nums">
                  {continuity.mandate.asking_price != null
                    ? fmtEur.format(continuity.mandate.asking_price)
                    : "—"}
                </span>
              </div>
              <div className="mt-1">
                <Button outline href={`/mandates/${continuity.mandate.id}`}>
                  <Icon name="mandates" data-slot="icon" />
                  {t.mandateOpen}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Text className="!text-sm">{t.mandateHint}</Text>
              {mandateError && <ErrorMessage>{mandateError}</ErrorMessage>}
              <div>
                <Button
                  color="indigo"
                  className="!text-zinc-950 hover:!text-zinc-950"
                  onClick={createMandate}
                  disabled={mandateBusy}
                >
                  <Icon name="mandates" data-slot="icon" />
                  {mandateBusy ? t.mandateCreating : t.mandateCreateCta}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Décision & prochaine action ── */}
      <section className="surface flex flex-col gap-4 p-5">
        <Subheading className="font-titre">{t.decisionTitle}</Subheading>
        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-[minmax(0,220px)_1fr]">
          <Field>
            <Label>{t.decisionLabel}</Label>
            <Select
              value={decision}
              onChange={(e) => setDecision(e.target.value as Decision | "")}
            >
              <option value="">{t.decisionNone}</option>
              {DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {t.decisions[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>{t.nextActionLabel}</Label>
            <Textarea
              rows={2}
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder={t.nextActionPlaceholder}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            color="indigo"
            className="!text-zinc-950 hover:!text-zinc-950"
            onClick={saveDecision}
            disabled={decisionBusy}
          >
            {decisionBusy ? t.saving : t.saveCta}
          </Button>
          {decisionMsg === "saved" && (
            <span className="text-sm font-medium text-accent-700">{t.saved}</span>
          )}
          {decisionMsg === "error" && <ErrorMessage>{t.saveError}</ErrorMessage>}
        </div>
      </section>

      {/* ── Composition de la valeur : calculé / saisi / manquant / à vérifier ── */}
      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Subheading className="font-titre">{t.adjustClarityTitle}</Subheading>
            <Text className="mt-1 !text-sm">{t.adjustClaritySubtitle}</Text>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge color="lime">{t.legendCalculated}</Badge>
            <Badge color="indigo">{t.legendManual}</Badge>
            <Badge color="zinc">{t.legendMissing}</Badge>
            <Badge color="amber">{t.legendVerify}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          {/* Calculé */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/5 bg-lin-brut/40 p-4">
            <div className="flex items-center gap-2">
              <Badge color="lime">{t.legendCalculated}</Badge>
              <span className="text-sm font-semibold text-zinc-800">
                {t.adjustCalculatedTitle}
              </span>
            </div>
            {calculated.length === 0 ? (
              <Text className="!text-xs">{t.adjustCalculatedEmpty}</Text>
            ) : (
              <ul className="flex flex-col gap-2">
                {calculated.map((adj, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge
                      color={adj.type === "premium" ? "lime" : "red"}
                      className="shrink-0 tabular-nums"
                    >
                      {adj.type === "premium" ? "+" : "−"}
                      {Math.abs(adj.pct)}%
                    </Badge>
                    <span>
                      <strong className="font-medium text-zinc-950">{adj.label}</strong>
                      {adj.rationale && (
                        <span className="text-zinc-500"> — {adj.rationale}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Saisi manuellement */}
          <div className="flex flex-col gap-2 rounded-xl border border-accent-400/30 bg-accent-500/[0.06] p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge color="indigo">{t.legendManual}</Badge>
                <span className="text-sm font-semibold text-zinc-800">
                  {t.adjustManualTitle}
                </span>
              </div>
              {!adjFormOpen && (
                <Button plain className="!text-xs" onClick={() => setAdjFormOpen(true)}>
                  <Icon name="plus" data-slot="icon" />
                  {t.addAdjustmentCta}
                </Button>
              )}
            </div>

            {manual.length === 0 && !adjFormOpen ? (
              <Text className="!text-xs">{t.adjustManualEmpty}</Text>
            ) : (
              <ul className="flex flex-col gap-2">
                {manual.map((adj) => (
                  <li key={adj.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Badge color="indigo" className="shrink-0 tabular-nums">
                        {adjustMagnitude(adj)}
                      </Badge>
                      <span>
                        <strong className="font-medium text-zinc-950">{adj.label}</strong>
                        {adj.raison && (
                          <span className="text-zinc-500"> — {adj.raison}</span>
                        )}
                        {adj.auteur && (
                          <span className="block text-xs text-zinc-400">
                            {t.adjustAuthorPrefix} {adj.auteur}
                          </span>
                        )}
                      </span>
                    </div>
                    <Button
                      plain
                      className="!text-xs shrink-0"
                      onClick={() => removeAdjustment(adj.id)}
                      disabled={removingId === adj.id}
                    >
                      {removingId === adj.id ? t.adjustRemoving : t.adjustRemove}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {adjFormOpen && (
              <div className="mt-2 flex flex-col gap-3 border-t border-accent-400/20 pt-3">
                <Field>
                  <Label>{t.adjustLabelLabel}</Label>
                  <Input
                    value={adjLabel}
                    onChange={(e) => setAdjLabel(e.target.value)}
                    placeholder={t.adjustLabelPlaceholder}
                    autoFocus
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,150px)_1fr]">
                  <Field>
                    <Label>{t.adjustUnitLabel}</Label>
                    <Select
                      value={adjUnit}
                      onChange={(e) => setAdjUnit(e.target.value as AdjustUnit)}
                    >
                      <option value="pct">{t.adjustUnitPct}</option>
                      <option value="eur">{t.adjustUnitEur}</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>{t.adjustValueLabel}</Label>
                    <Input
                      inputMode="numeric"
                      value={adjValue}
                      onChange={(e) => setAdjValue(e.target.value)}
                      placeholder={
                        adjUnit === "pct"
                          ? t.adjustValuePctPlaceholder
                          : t.adjustValueEurPlaceholder
                      }
                    />
                  </Field>
                </div>
                <Field>
                  <Label>{t.adjustRaisonLabel}</Label>
                  <Textarea
                    rows={2}
                    value={adjRaison}
                    onChange={(e) => setAdjRaison(e.target.value)}
                    placeholder={t.adjustRaisonPlaceholder}
                  />
                </Field>
                {adjError && <ErrorMessage>{adjError}</ErrorMessage>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    color="indigo"
                    className="!text-zinc-950 hover:!text-zinc-950"
                    onClick={submitAdjustment}
                    disabled={adjBusy}
                  >
                    {adjBusy ? t.adjustSaving : t.adjustSaveCta}
                  </Button>
                  <Button plain onClick={() => setAdjFormOpen(false)} disabled={adjBusy}>
                    {t.adjustCancel}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Manquant */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/5 bg-zinc-950/[0.02] p-4">
            <div className="flex items-center gap-2">
              <Badge color="zinc">{t.legendMissing}</Badge>
              <span className="text-sm font-semibold text-zinc-800">
                {t.adjustMissingTitle}
              </span>
            </div>
            {clarity.missing.length === 0 ? (
              <Text className="!text-xs">{t.adjustMissingEmpty}</Text>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {clarity.missing.map((f) => (
                  <li key={f.field}>
                    <Badge color="zinc">{f.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* À vérifier */}
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-950/5 bg-zinc-950/[0.02] p-4">
            <div className="flex items-center gap-2">
              <Badge color="amber">{t.legendVerify}</Badge>
              <span className="text-sm font-semibold text-zinc-800">
                {t.adjustVerifyTitle}
              </span>
            </div>
            {clarity.toVerify.length === 0 ? (
              <Text className="!text-xs">{t.adjustVerifyEmpty}</Text>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {clarity.toVerify.map((f) => (
                  <li key={f.field}>
                    <Badge color="amber">{f.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
