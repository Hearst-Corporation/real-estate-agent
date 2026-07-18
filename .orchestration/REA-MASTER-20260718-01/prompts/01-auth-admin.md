<!-- REA-M04-01 -->
# REA-M04-01 — Auth, MFA et isolation admin

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-auth-admin`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Durcir l'authentification et l'espace admin pour qu'un agent immobilier ne puisse jamais voir,
réinitialiser ou révoquer un compte hors de son propre tenant, et que le second facteur (MFA) ne
puisse jamais être contourné par une erreur d'implémentation.

## Faits réellement vérifiés dans le repo (base b2d8540)
- Auth = email + mot de passe via RPC Postgres `verify_login` (bcrypt/pgcrypto, migration `0037`).
  JWT `jose` custom → cookie `real_estate_agent_token` (httpOnly, 30j, sliding, `Domain=.hearst.app` en prod).
- Garde centrale : `proxy.ts` (Next 16, **pas** `middleware.ts`). Routes ouvertes : `/auth/*`,
  `/api/auth/login`, `/api/auth/logout`, `/api/auth/mfa/verify-login`, `/api/health`, `/api/inngest`,
  `/brochure/*`, `/api/brochure/*`.
- Bypass DEV : `AUTH_DEV_BYPASS=true` **et** `NODE_ENV !== production` uniquement (`proxy.ts`).
- MFA : migration `0035_user_mfa.sql` ; scope MFA-pending (`MFA_PENDING_SCOPE`) traité comme non-authentifié dans `proxy.ts`.
- Révocation : table `revoked_sessions` (migration `0028`), gate `AUTH_CHECK_REVOCATION` — **fail-open**
  (blip DB → laisse passer). Tokens legacy sans `jti` ignorés.
- Admin routes présentes : `app/api/admin/route.ts`, `app/api/admin/audit-log/route.ts`,
  `app/api/admin/mfa-reset/route.ts`. Audit auth : migration `0036_auth_audit_log.sql`.

## À vérifier / corriger notamment
- **MFA fail-open** : une erreur pendant la vérif TOTP ne doit jamais valider la session.
- **Reset cross-tenant** : `mfa-reset` et toute action admin doivent owner-checker `tenant_id` **avant** la DB.
- **Révocation optionnelle** : comportement quand `AUTH_CHECK_REVOCATION` off vs on doit être documenté et sûr.
- **Compteurs admin globaux** : aucun compteur/liste admin ne doit agréger au-delà du tenant courant.
- **Cookie domain partagé** : `Domain=.hearst.app` — vérifier l'isolation entre sous-domaines.
- **Rate limiting** sur `/api/auth/login` et `verify-login` (anti-bruteforce).

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `proxy.ts`, `app/api/auth/**`, `app/api/admin/**`, `lib/server/auth*.ts`,
`lib/server/session.ts`, `lib/tenant.ts`, et les migrations **additives** auth si nécessaire
(`supabase/migrations/00NN_*.sql`, numéro > 0045, jamais éditer une migration existante).
**Interdit** de toucher aux fichiers d'une autre mission (gateway, aigent, rls, UI, electron, e2e) et aux
fichiers partagés (§3 de MASTER.md : `database.types.ts`, `config/nav.ts`, `lib/ui-strings.ts`, etc.).

## Validations factuelles exigées
- Test unitaire prouvant MFA fail-**closed** (erreur → 401/403, pas de session).
- Test prouvant qu'un admin d'un tenant A ne peut pas reset/lister un user du tenant B (403).
- `pnpm typecheck` + `pnpm lint` verts sur ton diff ; tests auth ajoutés verts (`pnpm test`).
- Aucune migration appliquée sur GPU1 (tu écris le SQL, tu ne l'exécutes pas).

## Conditions STOP
- Tu ne peux pas prouver l'isolation cross-tenant sans exécuter une migration sur GPU1 → **STOP**, rapporte.
- Un correctif exigerait de modifier un fichier partagé → **STOP**, signale le besoin dans le rapport.
- Un secret ou identifiant réel apparaît nécessaire dans le code → **STOP**, n'invente rien.

## Interdits
Aucune opération Git (commit/push/merge/rebase/add). Aucun secret committé. Aucune donnée ou route inventée.

## Rapport vérité attendu
Liste exacte des fichiers touchés, tests ajoutés + résultat, limites connues, preuves (sorties de test/typecheck),
et besoins éventuels sur fichiers partagés. Rien présenté comme fait sans preuve collée.

<!-- REA-M04-01 -->
