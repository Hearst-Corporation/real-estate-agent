# REA-GPU1-006-M07 — Consommateurs DB partagés → GPU1 natif

Statut : **READY** (avec 2 dépendances cross-domaine attendues, non-régressions).

Base : RC `b7dcb4d` (socle M01 `lib/gpu1/**` + shims). RULE 0 respectée : aucun git, aucune migration, aucun réseau GPU1/LLM/déploiement.

## Fichiers édités (relatifs)

- `app/(dashboard)/page.tsx` — import `getSupabaseAdmin` → `getGpu1Admin`.
- `app/(dashboard)/agenda/page.tsx` — import migré ; cast projection `data as VisitRow[]` → `data as unknown as VisitRow[]` (embed properties/leads non décrit par la Row inférée, comme supabase-js).
- `app/api/tasks/route.ts` — imports + `type Db = Gpu1Client<Database>` + cast dynamique `(sb as Gpu1Client)` + `getGpu1Admin()` ×2 + message 503 `no_db` → `database_not_configured`.
- `app/api/tasks/[id]/route.ts` — idem (type Db, `getGpu1Admin()` ×2, messages neutres).
- `app/api/health/route.ts` — **ping DB recâblé** : lit désormais le client neutre `getGpu1Admin()` au lieu de `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. Lecture bornée `.from("leads").select("id").limit(1)`. Nouvel état `unconfigured` (distingue config / dispo / dégradation, sans faux vert). Commentaires purgés des noms de fournisseur (« PostgREST gpu1 » retiré).
- `app/api/cockpit-chat/route.ts` — import migré + message 503 `supabase_not_configured` → `database_not_configured`.
- `test/m07-health.test.ts` — **nouveau**, 5 tests.
- `test/m07-tasks.test.ts` — **nouveau**, 7 tests.

## Contrat / sécurité préservés

- **401 avant DB** : tasks GET/POST/PATCH/DELETE — `getSession()` puis `getGpu1Admin()` (prouvé : `getGpu1Admin` non appelé sans session).
- **Owner-check user_id + tenant_id** conservé sur chaque requête (le token admin bypasse la RLS) — prouvé par log des `.eq()` (isolation cross-tenant testée).
- **Health sûr** : ne révèle NI URL, NI token, NI fournisseur, NI topologie. Corps = `{ok, service, checks:{app,db(up|down|unconfigured),dbLatencyMs,auth,storage,jobs}}` + `providers` **uniquement** si session valide. `no-store`. 200 seulement si `db==="up"` ; `unconfigured` et `down` → 503 (pas de faux vert). Message d'erreur DB interne jamais propagé.
- **Erreurs publiques neutres** : `database_not_configured` partout, plus aucun nom de fournisseur.

## Tests (sorties)

```
vitest run test/m07-health.test.ts test/m07-tasks.test.ts
Test Files  2 passed (2)
     Tests  12 passed (12)
```
Couverture : DB absente (health unconfigured + tasks 503 neutre), DB en erreur (health down, pas de faux vert), DB up (200 + latence), providers réservés à la session, no-store, 401 avant DB (GET + PATCH), isolation cross-tenant (owner-check user+tenant), mutation tâche valide (done→200), id non-uuid→400.

## Scans rg (mon ownership) — 0 occurrence

`@supabase | getSupabaseAdmin | SupabaseClient | NEXT_PUBLIC_SUPABASE | SUPABASE_ | @/lib/supabase | @/lib/server/supabase` → **rien** dans les 6 fichiers + 2 tests.

## Gate ciblée

- `tsc --noEmit` : mes fichiers **0 erreur**, SAUF 2 dépendances cross-domaine (ci-dessous).
- `eslint <mes fichiers + tests>` : exit 0.

## Dépendances cross-domaine attendues (PAS des régressions — handoff)

`app/api/cockpit-chat/route.ts` lignes 164 & 188 : mon call-site passe correctement un `Gpu1Client`, mais deux consommateurs d'AUTRES domaines typent encore leur paramètre `SupabaseClient<Database>` :
- `lib/estimation/owned.ts` → `loadOwnedEstimation(sb, …)` (domaine **estimation**).
- `lib/agent/types.ts` → `ToolContext.sb` (domaine **agent/tools/gateway**).

Ces erreurs se résolvent quand leurs owners migrent leur annotation `SupabaseClient<Database>` → `Gpu1Client<Database>` (M01 §6). **Je n'y touche pas (ownership).** Aucun `as any` posé (interdit) — call-sites laissés propres.

## STOP / handoff (hors ownership, non touchés)

- `lib/admin/overview.ts` (utilise `getSupabaseAdmin`) — domaine **admin** → autre mission.
- `lib/estimation/owned.ts`, `lib/agent/types.ts` — voir ci-dessus.

## Ordre d'intégration

M07 intègre après M01, en parallèle des autres. Le tsc global de cockpit-chat ne passe au vert qu'une fois les owners estimation + agent ayant migré leurs signatures. Aucune modification visuelle (uniquement plomberie import/type + message d'erreur).
