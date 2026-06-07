/**
 * ProductBadges — badges de lecture instantanée d'un deal (étude P6).
 * Server component. Code couleur : nature (or) · finance (neutre) · risk (warn)
 * · secured (success) · conf (muted). Un badge résume une réalité juridique /
 * financière, JAMAIS un argument marketing (P6). Chaque badge porte un
 * aria-label complet (l'implication juridique + financière).
 */
export type BadgeFamily = "nat" | "fin" | "risk" | "secured" | "conf";

export interface ProductBadge {
  family: BadgeFamily;
  label: string;
  /** Description longue (implication juridique/financière) → aria-label + title. */
  detail?: string;
}

export function LegalBadge({ family, label, detail }: ProductBadge) {
  return (
    <span
      className={`inv-badge ${family}`}
      title={detail}
      aria-label={detail ? `${label} : ${detail}` : label}
    >
      <span className="inv-badge-dot" aria-hidden />
      {label}
    </span>
  );
}

export function ProductBadges({ badges }: { badges: ProductBadge[] }) {
  return (
    <div className="inv-badge-row" role="list">
      {badges.map((b) => (
        <span role="listitem" key={`${b.family}-${b.label}`}>
          <LegalBadge {...b} />
        </span>
      ))}
    </div>
  );
}

/** Helper : compose le jeu de badges canonique d'un deal de démo. */
export function dealBadges(input: {
  typeLabel: string;
  rangLabel: string;
  risqueEleve: boolean;
}): ProductBadge[] {
  const badges: ProductBadge[] = [
    { family: "nat", label: input.typeLabel, detail: "Nature de l'opération portée par la SAS émettrice." },
    {
      family: "fin",
      label: input.rangLabel,
      detail: "Rang de la créance dans le waterfall : il détermine l'ordre de remboursement.",
    },
    {
      family: "secured",
      label: "Hypothèque 1er rang",
      detail: "Sûreté réelle au profit de la dette senior ; activable en cas de défaut.",
    },
    {
      family: "fin",
      label: "Distribution variable",
      detail: "Le coupon est cible et non garanti : il dépend du produit disponible à l'exit.",
    },
    {
      family: "conf",
      label: "France",
      detail: "Opération située en France ; règlement en euros.",
    },
    {
      family: "conf",
      label: "KYC obligatoire",
      detail: "Vérification d'identité requise avant toute souscription (LCB-FT).",
    },
  ];
  if (input.risqueEleve) {
    badges.splice(2, 0, {
      family: "risk",
      label: "Risque élevé",
      detail: "Perte en capital possible ; affiché en toute honnêteté au même niveau que les éléments positifs.",
    });
  }
  return badges;
}
