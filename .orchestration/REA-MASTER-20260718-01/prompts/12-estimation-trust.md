<!-- REA-M04-12 -->
# REA-M04-12 — Estimation : providers, provenance et partage de confiance

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-estimation-trust`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre l'estimation digne de confiance et partageable : chaque valeur trace sa provenance (quel provider,
quelle donnée), l'indice de confiance est calculé honnêtement, et le PDF / partage API reflètent fidèlement
ces informations sans jamais présenter une donnée absente comme certaine.

## Faits réellement vérifiés dans le repo (base b2d8540)
- Moteur estimation : `lib/estimation/**` — `comparables.ts`, `dvf.ts`, `ademe.ts`, `cadastre.ts`,
  `clarity.ts`, `continuity.ts`, `endpoints.ts`, `listings.ts`, `tool-schema.ts` (+ leurs `.test.ts`).
- Versioning moteur : migration `0038_estimation_engine_versioning.sql` ; lien propriété `0039_estimation_property_link.sql`.
- PDF / partage : route PDF sous `app/api/estimations/[id]/pdf/**` ; brochure publique signée
  (`/api/brochure/*`, ouverte dans `proxy.ts`).
- Providers réels (DVF, ADEME, cadastre) — `lib/providers/**`, `lib/estimation/endpoints.ts`.

## Périmètre (STRICT)
- Moteur, providers, provenance, PDF, partage API. **Ne pas toucher l'UI estimation** (mission 10 :
  `app/(dashboard)/estimations/**`).
- Renforcer la **provenance** (traçabilité provider→valeur) et le **calcul de confiance** ;
  garantir qu'un provider indisponible → état honnête, jamais une valeur inventée.
- Aucune migration appliquée sur GPU1 (SQL versionné seulement si nécessaire, numéro > 0045).

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `lib/estimation/**`, `lib/providers/**` (parties estimation), les routes
`app/api/estimations/**` (PDF, partage), et une éventuelle migration additive de versioning.
**Interdit** : `app/(dashboard)/estimations/**` (mission 10), la gateway/aigent, l'auth, et les fichiers
partagés (`database.types.ts`, `lib/ui-strings.ts`, primitives). Signale tout besoin partagé.

## Validations factuelles exigées
- Test : provider indisponible → valeur marquée « non disponible / provenance manquante », jamais fabriquée.
- Test : indice de confiance dérive bien des données présentes (assert sur cas connu).
- Preuve PDF/partage reflètent provenance + confiance (test ou capture non-PII).
- `pnpm typecheck` + `pnpm lint` + tests estimation verts sur ton diff.

## Conditions STOP
- Un provider exige une clé API absente → **STOP**, signale la var manquante (factuel, sans conseil), n'invente pas de valeur.
- Le PDF/partage exige une modif d'UI (mission 10) → **STOP**, coordonne via rapport.

## Interdits
Aucune opération Git. Aucune valeur d'estimation/provider inventée. Aucun secret committé. Aucune migration GPU1.
Ne pas toucher l'UI estimation (mission 10).

## Rapport vérité attendu
Fichiers touchés, provenance/confiance prouvées, comportement provider-down, PDF/partage vérifiés, limites, preuves,
vars manquantes éventuelles, besoins partagés.

<!-- REA-M04-12 -->
