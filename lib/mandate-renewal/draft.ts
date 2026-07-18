/**
 * lib/mandate-renewal/draft.ts — Génération PURE du brouillon propriétaire.
 * =========================================================================
 *
 * À partir de l'analyse déterministe (résumé + proposition), compose un message
 * email destiné au propriétaire. Le texte n'invente RIEN : il ne cite que les
 * chiffres présents dans l'analyse. Le message reste un BROUILLON (DRAFT) —
 * l'envoi passe toujours par validation humaine (HITL) via l'outbox.
 */

import {
  RENEWAL_ACTION_LABELS,
  type MandateRenewalAnalysis,
} from "@/lib/mandate-renewal/aggregate";

function fmtEur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} €`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(t));
}

export interface DraftContext {
  /** Nom lisible du bien (title / adresse). */
  propertyLabel: string;
  /** Nom du propriétaire (prénom) si connu, sinon undefined. */
  ownerName?: string | null;
}

export interface GeneratedDraft {
  subject: string;
  body: string;
}

/**
 * Corps du message selon l'action recommandée. Chaque variante s'appuie
 * uniquement sur des faits présents dans `analysis`.
 */
function actionParagraph(analysis: MandateRenewalAnalysis): string {
  const { proposal, market } = analysis;
  switch (proposal.action) {
    case "adjust_price":
      return (
        `Au vu des retours et de l'évolution du marché, nous vous proposons d'ajuster ` +
        `le prix de présentation autour de ${fmtEur(proposal.suggestedPrice ?? market.latestMarketValue)}. ` +
        `Cet alignement sur la valeur de marché la plus récente devrait relancer les demandes ` +
        `avant l'échéance du mandat.`
      );
    case "change_strategy":
      return (
        `Malgré ${analysis.activity.visitsDone} visite(s) organisée(s), le bien n'a pas encore ` +
        `déclenché de retour d'acquéreur suffisamment engageant. Nous vous proposons de faire ` +
        `évoluer la stratégie de commercialisation (diffusion, mise en valeur, positionnement) ` +
        `et de reconduire le mandat pour la mettre en œuvre.`
      );
    default:
      return (
        `La commercialisation est en bonne voie${
          analysis.feedback.positiveSignals > 0
            ? ` (${analysis.feedback.positiveSignals} retour(s) positif(s) d'acquéreurs)`
            : ""
        }. Nous vous proposons de reconduire le mandat afin de poursuivre les démarches ` +
        `engagées dans les mêmes conditions.`
      );
  }
}

export function generateOwnerDraft(
  analysis: MandateRenewalAnalysis,
  ctx: DraftContext,
): GeneratedDraft {
  const greeting = ctx.ownerName?.trim()
    ? `Bonjour ${ctx.ownerName.trim()},`
    : "Bonjour,";

  const expiryLine =
    analysis.daysUntilExpiry >= 0
      ? `Votre mandat sur le bien « ${ctx.propertyLabel} » arrive à échéance le ${fmtDate(
          analysis.expiresAt,
        )} (dans ${analysis.daysUntilExpiry} jour(s)).`
      : `Votre mandat sur le bien « ${ctx.propertyLabel} » est arrivé à échéance le ${fmtDate(
          analysis.expiresAt,
        )}.`;

  const activityLine = `À ce jour : ${analysis.activity.visitsDone} visite(s) réalisée(s)${
    analysis.activity.visitsUpcoming > 0
      ? ` et ${analysis.activity.visitsUpcoming} programmée(s)`
      : ""
  }.`;

  const objectionLines = analysis.feedback.objections.slice(0, 3).map((o) => `• ${o.text}`);
  const objectionBlock = objectionLines.length
    ? `\n\nPrincipaux retours recueillis lors des visites :\n${objectionLines.join("\n")}`
    : "";

  const marketLine =
    analysis.market.available && analysis.market.latestMarketValue != null
      ? `\n\nNotre estimation de marché la plus récente ressort à ${fmtEur(
          analysis.market.latestMarketValue,
        )}${
          analysis.market.askingPrice != null
            ? ` (prix actuellement affiché : ${fmtEur(analysis.market.askingPrice)})`
            : ""
        }.`
      : "";

  const proposalLine = `\n\nNotre recommandation : ${RENEWAL_ACTION_LABELS[
    analysis.proposal.action
  ].toLowerCase()}. ${actionParagraph(analysis)}`;

  const closing =
    "\n\nJe reste à votre disposition pour en échanger et convenir d'un rendez-vous.\n\nBien à vous,";

  const body = `${greeting}\n\n${expiryLine} ${activityLine}${objectionBlock}${marketLine}${proposalLine}${closing}`;

  const subject = `Renouvellement de votre mandat — ${ctx.propertyLabel}`;

  return { subject, body };
}
