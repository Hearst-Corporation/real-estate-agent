<!-- REA-M04-04 -->
# REA-M04-04 — Contrat runtime Aigent strict

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-aigent`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Garantir que la couche cliente qui consomme le runtime Aigent externe reste 100 % honnête : elle
propage l'état réel du registre (vide / 404 / indisponible) et ne transforme **jamais** une réponse
HTTP 200 malformée en liste vide ou en faux succès.

## Faits réellement vérifiés dans le repo (base b2d8540)
- `lib/aigent/runtime.ts` (`server-only`) + `lib/aigent/runtime-types.ts`. Client du registre runtime
  Aigent, **feature-détecté** : sans `AIGENT_RUNTIME_BASE_URL` + `AIGENT_RUNTIME_TOKEN`,
  `runtimeAvailability()` → `{ available:false, reason:"not_configured" }`, aucune requête émise.
- Timeout borné : `AIGENT_RUNTIME_TIMEOUT_MS` (défaut 10000). Fail-soft : toute défaillance transport
  renvoie un `RuntimeResult` qualifié (`unavailable`/`error`/`notFound`/`conflict`), jamais un throw non géré.
- Proxy API : `app/api/aigent/**` (`agents`, `agents/[id]`, `agents/[id]/runs`, `runs/[id]`,
  `runs/[id]/events`, `runs/[id]/resume`, `_shared.ts`). Token runtime **server-only**, jamais exposé au navigateur.
- Le module « ne FABRIQUE JAMAIS d'agent, de run ni de résultat ».

## À vérifier / corriger notamment
- **Parsing Zod strict** de chaque réponse runtime : un 200 dont le corps ne valide pas le schéma doit
  produire un état `error` explicite, **pas** un tableau vide ni un succès factice.
- **Timeouts** respectés et testés (abort au-delà du délai).
- **États indisponibles** distincts et corrects (`not_configured`, `unavailable`, `notFound`, `conflict`, `error`).
- Le token runtime n'est jamais loggé ni renvoyé au client.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `lib/aigent/**`, `app/api/aigent/**` **sauf** `runs/[id]/resume/route.ts`
(détenu par la mission 02 — HITL). **Interdit** : la gateway (`app/api/agent-gateway/**`,
`lib/agent-gateway/**`), l'UI `/agents` (`app/(dashboard)/agents/**`, mission 07/08 si elle y touche),
l'auth, les fichiers partagés.

## Validations factuelles exigées
- Test : réponse 200 malformée → état `error`, jamais liste vide / faux succès.
- Test : timeout → `error`/`unavailable`, pas de hang.
- Test : non configuré → `not_configured`, zéro requête réseau.
- `pnpm typecheck` + `pnpm lint` + tests aigent verts sur ton diff.

## Conditions STOP
- Le durcissement exigerait de changer le contrat côté Aigent (repo externe) → **STOP**, documente ;
  Aigent/LangGraph restent **externes**, tu ne les modifies pas.
- Un correctif touche `runs/[id]/resume` (mission 02) → **STOP**, signale le besoin de coordination.

## Interdits
Aucune opération Git. Aucun appel réseau réel vers Aigent en test (mock/stub uniquement). Aucun secret
committé. Aucun agent/run inventé.

## Rapport vérité attendu
Fichiers touchés, schémas Zod ajoutés/renforcés, tests + résultats collés, limites, preuves.

<!-- REA-M04-04 -->
