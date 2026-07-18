# IMPLEMENTATION MISSIONS — REA-GAMECHANGER-005

> La shortlist transformée en **3 missions orchestrables** (façon REA-MASTER : un Opus maître, workers en
> worktrees isolés, workers jamais git, intégration sérialisée). Ownership DISJOINT par fichiers ; les
> fichiers partagés (`config/nav.ts`, `lib/ui-strings.ts`, `lib/supabase/database.types.ts`,
> `package.json`, primitives) restent réservés à l'intégrateur, pattern MASTER.md §3. Base recommandée :
> tip de `feature/rea-platform-003` (ou `feature/rea-master-004` si la vague M04 est intégrée d'ici là —
> à re-vérifier au lancement). Numéros = `EXECUTIVE-SHORTLIST.md`.

## Mission GC-M1 — « Socle validation & quotidien » (lancer EN PREMIER)

**Contenu** : #3 Centre d'approbation + Journal · #4 Boîte de sortie (`rea_comm_drafts`) · #14 Registre de
liens (`share_links`) · #9 Score de priorité · #12 Radar expiration · extensions gateway `tasks.create` /
`comm.drafts.create` (S, additives) · prérequis ops : plan de déploiement `0045` (fenêtre, rollback).

**Ownership fichiers** : `app/(dashboard)/agents/**` (onglets Approbations/Journal), l'accueil
`app/(dashboard)/page.tsx` + `components/cockpit/ActionCenter.tsx` (score, outbox, tuiles), `lib/comm/**`
(nouveau), `lib/share-links/**` (nouveau), `lib/agent-gateway/**` (routes additives uniquement),
`app/api/agents-approvals|comm-drafts|share-links/**` (nouvelles routes), migrations `00NN` additives
(`rea_comm_drafts`, `share_links`).

**Livrable démontrable** : approbation 1 clic qui déclenche un dispatch réel ; 5 brouillons validables ;
accueil scoré ; 100 % des liens émis révocables.

**Dépendances** : aucune (c'est le socle). Risques : connexion Composio par tenant (statut variable —
fallback « copier le texte » si non connecté) ; 0045 non posée → mode « préparation seule » assumé.

## Mission GC-M2 — « Radar vendeur & matching intelligent »

**Contenu** : #1 Radar vendeur complet (onglet + scoring + tâches + sparkline détail + 2 tools chat) ·
#2 Off-market push · #10 Apprentissage des feedbacks · #11 Critères câblés · #15 Carte de secteur ·
Vigie V1 (cron Inngest) → V2 (agent LangGraph externe, si M1 livrée et registre activable).

**Ownership fichiers** : `app/(dashboard)/prospection/**`, `lib/prospection/**` (scoring, matching,
mappers, functions cron), `app/api/prospection/**`, `lib/agent/tools/prospection.ts`,
`lib/estimation/staticmap.ts` (réutilisation lecture seule), `app/api/inngest/**` (jobs Vigie), migration
additive si nécessaire (aucune prévue : tables 0040-0043 suffisent).

**Livrable démontrable** : le scénario « la nuit détecte, le matin propose » ; un mandat signé fait
remonter les acquéreurs compatibles ; une exclusion saisie exclut réellement ; carte du secteur.

**Dépendances sur M1** : l'écriture des tâches (`rea_tasks`) suit le format que M1 affiche ; la
« préparation de contact » du Radar dépose dans la Boîte de sortie (#4) ; la Vigie V2 passe par le Centre
d'approbation (#3). → M2 démarre en parallèle de M1 mais s'INTÈGRE après elle.

## Mission GC-M3 — « Visite terrain & surfaces client & conversion estimation »

**Contenu** : #5 Fiche `/visits/[id]` (statut + vocal + qualif, puis photos/brouillon/partage) ·
#6 Sélection acquéreur partagée (`/selection/[token]`) · #7 Rapport vendeur (`/rapport/[token]`) ·
#8 Radar d'ouverture de brochure (`estimation_share_events`) · #13 Veille de valeur.

**Ownership fichiers** : `app/(dashboard)/visits/**` (+ nouvelle fiche), `app/(dashboard)/estimations/**`
(`ContinuityPanel`, `ValuationHero` — attention frontière M04-10/12 : additions, pas de refonte),
`app/selection/[token]/**` + `app/rapport/[token]/**` (nouvelles pages publiques), `app/api/brochure/**`
(ping d'ouverture), `lib/reporting/**` (nouveau), `lib/estimation/share.ts` (extension révocation via
`share_links` de M1), migrations additives (`prosp_selections`, `prosp_selection_items`,
`estimation_share_events`, colonnes feedback client).

**Livrable démontrable** : dictée → CR en base → brouillon vendeur ; sélection votée par l'acquéreur
visible sur la fiche ; rapport vendeur consultable ; « ouvert 3× ce matin » → tâche d'appel.

**Dépendances sur M1** : brouillon vendeur via #4 ; liens publics enregistrés/révocables via #14.
**Point dur sécurité** (opus-10 §4.1) : la route publique ÉCRIVANTE de #6 (rate-limit par token,
validation `match_id ∈ selection`, anti-énumération) est le vrai coût — la traiter comme un mini-projet
sécurité, pas un formulaire.

## Ordre d'intégration & fichiers partagés

1. **M1 s'intègre en premier** (socle). 2. **M2 ensuite** (branche ses sorties sur M1). 3. **M3 enfin**
(consomme #4 + #14). Les trois peuvent CODER en parallèle dans leurs worktrees ; seule l'INTÉGRATION est
séquencée. L'intégrateur résout une seule fois : `config/nav.ts` (aucune entrée top-level nouvelle — seules
les routes détail/publiques s'ajoutent hors nav), `lib/ui-strings.ts` (sections nouvelles par mission),
`lib/supabase/database.types.ts` (régénéré après CHAQUE migration posée), `package.json` (aucune dépendance
nouvelle prévue — Web Speech natif, staticmap existant, jose existant).

## Garde-fous transverses (hérités des missions précédentes, non négociables)

- Migrations **additives uniquement**, versionnées `supabase/migrations/00NN_*.sql`, appliquées sur gpu1
  par l'orchestrateur/Adrien (jamais un worker), reload PostgREST après DDL, `database.types.ts` réconcilié.
- Auth fail-closed sur toute route nouvelle ; owner-check user+tenant systématique (service-role bypass RLS).
- Toute communication = brouillon/HITL ; `prosp_optout` respecté ; liens publics : données minimales,
  expiration, révocation, jamais de PII visiteur.
- Gate réelle du repo : `pnpm check` + `pnpm test` + `pnpm build` (+ `test-migrations-coherence.mjs` si
  migration) — verte AVANT tout commit d'intégration ; vérification browser Playwright sur chaque écran touché.
- Pas de nouveau menu top-level ; primitives Cockpit existantes ; zéro hex en dur.

## Prompt de lancement recommandé (vague 1)

Lancer GC-M1 + GC-M2 en parallèle (M3 à J+3 une fois `rea_comm_drafts`/`share_links` mergées) avec le
squelette de prompt : contexte = `EXECUTIVE-SHORTLIST.md` + `SCREEN-PLACEMENT-MAP.md` + le rapport opus
source de chaque item ; contrainte = ownership ci-dessus + garde-fous ; preuve = gate verte + captures
Playwright par écran + rapport vérité.
