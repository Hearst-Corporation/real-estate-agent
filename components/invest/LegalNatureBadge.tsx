/**
 * LegalNatureBadge — rappel PERMANENT de la nature juridique du titre (L4,
 * mise en garde AMF 29/12/2022). Server component.
 *
 * Wording verrouillé (§16) : "obligations", "créancier", "vous prêtez à la SAS",
 * "titre de créance tokenisé". INTERDIT : "propriétaire", "votre bien".
 * Posé en haut de chaque fiche deal.
 */
import { IconScale } from "./icons";

export function LegalNatureBadge({ sasName }: { sasName: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      role="note"
    >
      <IconScale className="size-5 shrink-0 text-amber-300" />
      <div>
        Vous souscrivez des <b>obligations</b> émises par la SAS « {sasName} ». Vous êtes{" "}
        <b>créancier</b>, vous prêtez à la société — vous n’êtes pas propriétaire du bien. Titre de
        créance tokenisé (ERC-3643), adossé au registre légal DEEP. Rendement <b>non garanti</b>,
        perte en capital possible.
      </div>
    </div>
  );
}
