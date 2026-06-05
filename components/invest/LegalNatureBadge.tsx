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
    <div className="inv-callout legal" role="note">
      <IconScale className="inv-callout-ic" />
      <div>
        Vous souscrivez des <b>obligations</b> émises par la SAS « {sasName} ». Vous êtes{" "}
        <b>créancier</b>, vous prêtez à la société — vous n’êtes pas propriétaire du bien. Titre de
        créance tokenisé (ERC-3643), adossé au registre légal DEEP. Rendement <b>non garanti</b>,
        perte en capital possible.
      </div>
    </div>
  );
}
