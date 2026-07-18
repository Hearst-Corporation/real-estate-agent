# MASTER — REA-MASTER-20260718-01

> Paquet d'orchestration **Master Wave 004** pour `Hearst-Corporation/real-estate-agent`.
> Mission `prepare` uniquement : ce paquet **décrit** l'exécution. Il ne code rien, ne lance aucun worker,
> ne merge rien dans `main`, ne déploie rien. L'Opus maître qui consomme ce paquet exécute la vague.

## 0. Identité de la vague

| Champ | Valeur |
|---|---|
| Run ID | `REA-MASTER-20260718-01` |
| Branche de coordination | `orchestration/REA-MASTER-20260718-01` |
| Base retenue (`baseHead`) | `b2d85403419d2007cb106c9e85abc1d9341685f0` |
| Branche de la base | `feature/rea-platform-003` |
| Remote | `https://github.com/Hearst-Corporation/real-estate-agent.git` |
| Branche d'intégration à créer | `feature/rea-master-004` |
| Gestionnaire de paquets | **pnpm** (`pnpm-lock.yaml`) |

### Pourquoi cette base

La base précédemment identifiée était `feature/rea-platform-003` @ `064f88b`. Vérification locale + `origin` :
`064f88b` est l'**ancêtre direct** de `b2d8540` (`git merge-base --is-ancestor 064f88b b2d8540` → vrai).
`b2d8540` = `064f88b` + 1 commit (`feat(agent-gateway): buyers.update_preferences + listings.normalize
AVAILABLE (15/15) + fix console`) qui **complète la gateway** (2 interfaces de plus, +5 fichiers de tests)
sans rien retirer. C'est donc la branche cohérente **strictement la plus avancée** contenant :

- **REA-PLATFORM-002** (LAST_REPORT présent, migration 0043 additive) ;
- **la gateway agent** : `app/api/agent-gateway/v1/**` (15 routes), `lib/agent-gateway/**`
  (auth, scopes, delegation, idempotency, approval, audit, contracts) ;
- **les migrations** plateforme/gateway/approbations : `0043_platform_augmented_002.sql`,
  `0044_agent_gateway.sql`, `0045_alert_approvals.sql` ;
- **la page `/agents`** : `app/(dashboard)/agents/page.tsx` + `_components/` (AgentCard, AgentsCockpit, RunTracker) ;
- **le proxy Aigent** : `app/api/aigent/**` (agents, runs, events, resume) + `lib/aigent/runtime.ts` (server-only, feature-détecté) ;
- **les contrôles HITL** : `app/api/aigent/runs/[id]/resume/route.ts`, migration `0030_swarm_runs_paused_hitl.sql`.

`b2d8540` a été **poussé sur `origin/feature/rea-platform-003`** (fast-forward `064f88b..b2d8540`,
aucun force) pour rendre le `baseHead` vérifiable à distance. Toutes les branches de mission et la
branche d'intégration partent de ce même SHA.

## 1. Gate réelle du repo (vérifiée, ne pas inventer)

- `pnpm check` = `concurrently` de : `lint:secrets`, `lint` (next lint), `lint:nav`, `lint:strings`,
  `gen-cockpit-manifest --check`, `typecheck` (tsc --noEmit), `lint:biome`, `check:catalyst`.
  **`check` n'exécute NI `test` NI `build`** — ils sont des scripts séparés.
- `pnpm test` (vitest), `pnpm build` (next build), `pnpm test:e2e` (Playwright smoke), scripts
  `scripts/test-migrations-coherence.mjs` (cohérence migrations) et `scripts/db-diagnose.mjs` (diag DB).
- Electron : `pnpm electron:test`, `pnpm electron:build`.
- CI : `.github/workflows/ci.yml`.

## 2. Règles d'exécution pour l'Opus maître

L'Opus qui exécute cette vague **DOIT** :

1. Créer **un worktree isolé par mission**, tous depuis le **même `baseHead`** (`b2d8540`).
2. Utiliser des **workers Quick** (mode `/quick`), un worker par mission.
3. Lancer **le maximum compatible avec ses slots** en parallèle, mettre le reste **en file**.
4. **Interdire Git aux workers** (RULE 0) : un worker livre ses **fichiers édités**, jamais un commit/push/merge.
5. **Inspecter chaque diff avant commit** (`git show --name-only`), refuser tout fichier **hors ownership**.
6. **Committer et pousser chirurgicalement** chaque branche de mission validée — staging **par chemins
   exacts** (`git add -- <fichiers>`), **jamais** `git add .` / `git add -A`, **jamais** de force-push.
7. Sérialiser l'intégration (index git = état partagé) : `GIT_INDEX_FILE` dédié + resync après commit +
   pathspec explicite (cf. CLAUDE.md global § INTÉGRATION CONCURRENTE).
8. **Copier les rapports** de chaque worker dans `reports/`.
9. Créer ensuite **`feature/rea-master-004`** depuis `b2d8540`, y **intégrer uniquement les branches
   validées**, **résoudre les fichiers partagés une seule fois** (cf. §3).
10. **Relancer la mission QA (14)** contre la release candidate `feature/rea-master-004`.
11. Exécuter la vérification finale : `pnpm check`, `pnpm test`, `pnpm build`,
    `scripts/test-migrations-coherence.mjs`, `pnpm test:e2e`, `pnpm electron:test` (Electron ciblé).
12. **Ne jamais merger dans `main`. Ne jamais déployer en production. Ne jamais appliquer de migration
    sur GPU1. Ne jamais toucher aux secrets Vercel.**

## 3. Fichiers partagés — réservés à l'intégrateur

Les workers **ne modifient jamais directement** ces fichiers ; ils **signalent leur besoin** dans leur rapport.
L'Opus maître les résout **une seule fois** à l'intégration :

- `lib/supabase/database.types.ts`
- `package.json`
- `pnpm-lock.yaml`
- `config/nav.ts`
- `lib/ui-strings.ts`
- `app/globals.css`
- primitives globales Catalyst (`components/ui/*`, `components/cockpit/primitives.tsx`)
- `LAST_REPORT.md`

## 4. Matrice des missions (14)

| # | ID | Branche | Périmètre |
|---|---|---|---|
| 01 | REA-M04-01 | `feature/rea-m04-auth-admin` | Auth, MFA, isolation admin |
| 02 | REA-M04-02 | `feature/rea-m04-gateway` | Gateway Aigent, identité, idempotence, HITL |
| 03 | REA-M04-03 | `feature/rea-m04-rls` | RLS + matrice d'accès prospection |
| 04 | REA-M04-04 | `feature/rea-m04-aigent` | Contrat runtime Aigent strict |
| 05 | REA-M04-05 | `feature/rea-m04-prod-gates` | Boot, health, CI, contrat de déploiement |
| 06 | REA-M04-06 | `feature/rea-m04-buyer-finance` | Financement acquéreur |
| 07 | REA-M04-07 | `feature/rea-m04-shell` | Shell responsive + Assistant contextuel |
| 08 | REA-M04-08 | `feature/rea-m04-daily-cockpit` | Cockpit quotidien + Agenda |
| 09 | REA-M04-09 | `feature/rea-m04-prospection-ui` | Prospection haute densité (UI) |
| 10 | REA-M04-10 | `feature/rea-m04-estimation-ui` | Estimation mobile + continuité commerciale (UI) |
| 11 | REA-M04-11 | `feature/rea-m04-crm-ui` | CRM & portefeuille denses (UI) |
| 12 | REA-M04-12 | `feature/rea-m04-estimation-trust` | Estimation : providers, provenance, PDF, partage |
| 13 | REA-M04-13 | `feature/rea-m04-electron` | Electron production + parité web |
| 14 | REA-M04-14 | `feature/rea-m04-qa` | E2E, accessibilité, preuves consolidées |

## 5. Garde-fous absolus (rappel)

- Aucun secret, token, `.env`, PII, ou capture non anonymisée committé.
- Aucun `git reset --hard` / `git clean` / `git checkout --` / force-push / suppression de branche existante.
- Aucun `git add .` / `git add -A`.
- Aucun merge dans `main`, aucun déploiement, aucune migration GPU1, aucun changement de secrets Vercel.
- Aucun moteur Swarms/CrewAI interne : Aigent/LangGraph restent **externes**.
- Chaque worker rapporte un **rapport vérité** : fichiers touchés, tests, limites, preuves — zéro donnée
  ou fonctionnalité inventée.

<!-- REA-MASTER-20260718-01 -->
