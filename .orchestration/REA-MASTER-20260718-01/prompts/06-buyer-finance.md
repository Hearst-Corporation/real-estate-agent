<!-- REA-M04-06 -->
# REA-M04-06 — Financement acquéreur

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-buyer-finance`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre le champ `leads.financement` réellement utilisable dans le parcours acquéreur : l'agent saisit
et consulte la situation de financement d'un lead (comptant / prêt en cours / accord de principe / etc.)
pour prioriser et qualifier, via l'API et l'UI.

## Faits réellement vérifiés dans le repo (base b2d8540)
- La colonne `leads.financement` **existe** (ajoutée par migration `0043`, cf. LAST_REPORT : `leads`(urgence/financement)).
- Recherche `financement` dans le code : présent **uniquement** dans `lib/supabase/database.types.ts`
  (types générés). **Aucun câblage** dans les routes API leads ni l'UI leads → le champ est aujourd'hui **inerte**.
- Leads : `app/(dashboard)/leads/**`, routes API leads existantes, `lib/crm/**`.

## Périmètre (STRICT)
- Câbler `leads.financement` de bout en bout : lecture + écriture dans l'API leads, affichage + édition
  dans l'UI de la fiche lead / création lead. **Aucune nouvelle migration** (la colonne existe déjà).
- **Aucune donnée financière fabriquée** : afficher « non renseigné » quand vide, jamais une valeur inventée.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : les routes API leads (`app/api/leads/**` ou équivalent existant), `lib/crm/**`
(lecture/écriture financement), et l'UI leads (`app/(dashboard)/leads/**`, ses `_components`).
**Interdit** : créer une migration, toucher au CRM UI biens/mandats/visites (mission 11), à l'estimation,
à la prospection, aux fichiers partagés (`database.types.ts` — l'intégrateur régénère ; `lib/ui-strings.ts` ;
`config/nav.ts`). Si un enum de valeurs de financement doit vivre dans `lib/ui-strings.ts`, **signale-le**,
ne l'édite pas.

## Validations factuelles exigées
- Preuve (Playwright ou test) : saisir un financement sur un lead le persiste et le réaffiche.
- Vide → « non renseigné », jamais de valeur par défaut trompeuse.
- `pnpm typecheck` + `pnpm lint` verts ; test ajouté si logique de qualification.

## Conditions STOP
- Le câblage exige une nouvelle colonne/migration → **STOP** (le périmètre interdit toute migration ici).
- Une valeur d'enum financement doit être partagée via `lib/ui-strings.ts` → **STOP**, signale le besoin.

## Interdits
Aucune opération Git. Aucune nouvelle migration. Aucune donnée financière inventée. Aucun secret.

## Rapport vérité attendu
Fichiers touchés (API + UI), preuve persistance/affichage collée, gestion du vide, limites, besoins fichiers partagés.

<!-- REA-M04-06 -->
