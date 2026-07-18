# REA-GAMECHANGER-005 — Opus 05 · CRM Relationnel & Communication

> Domaine : contacts, chronologie unifiée client-bien, relances, emails/SMS/WhatsApp, comptes rendus,
> anniversaires de recherche, réactivation des prospects froids, nurturing long terme.
> Règle dure respectée partout : **toute communication automatique reste BROUILLON ou soumise à
> validation humaine explicite.** Le seul canal sortant réellement câblé et sûr — `createGmailDraft`
> (`GMAIL_CREATE_EMAIL_DRAFT`, Composio) — crée un **brouillon Gmail qui n'est jamais envoyé** :
> il tombe dans les brouillons de l'agent, qui relit et clique « Envoyer ». C'est la clé de voûte
> de tous mes candidats.

---

## Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes (O/P/N) | Effet business (1 ligne) |
|---|----------|-------|--------|-------|------------------------|--------------------------|
| 1 | **File de brouillons de relance validables en 1 clic** (Boîte de sortie CRM) | Accueil `/` (sous ActionCenter) + fiche lead | M | **88** | P | Transforme « qui relancer » (déjà là) en « voici le message prêt à envoyer » : le trou entre décision et action disparaît. |
| 2 | **Chronologie unifiée lead / bien** (timeline union) | `/leads/[id]` + `/properties/[id]` | M | **85** | O | L'agent voit TOUT l'historique d'un client/bien en 3 s (visites, estims, matchs, contacts, tâches) — fin du « je cherche dans 5 onglets ». |
| 3 | **Réactivation froid à prétexte réel** (baisse de prix / nouveau match / anniversaire) | `/prospection` onglet Feedback → nouveau panneau + Accueil | M | **83** | O | Ré-engage les leads dormants au bon moment avec un fait concret — le prétexte que 90 % des agents n'ont pas le temps de trouver. |
| 4 | **Compte rendu de visite structuré → brouillon vendeur** | `/visits` + `/leads/[id]` (fiche vendeur) | S | **82** | P | Après chaque visite : 4 champs → un débrief propre + un brouillon d'email propriétaire prêt. Le suivi vendeur devient systématique. |
| 5 | **Séquence de nurturing à étapes approuvables** (cadence relance) | Fiche lead `/leads/[id]` + Accueil | M | **76** | P | Un plan de relance multi-étapes (J+2 / J+15 / J+45) où CHAQUE étape est un brouillon à valider — nurturing long terme sans envoi auto. |
| 6 | **Espace propriétaire / rapport de mandat partagé** (lien signé) | `/mandates/[id]` → page publique `/rapport/[token]` | M | **72** | O | Le vendeur suit en autonomie les visites/actions sur son bien → moins d'appels « alors, ça avance ? », mandats renouvelés. |

Tous ≥ 70. Classés par score. Détail du décompte dans §4.

---

## Lecture du terrain

### Fichiers vérifiés (chemins + constats)

- **`lib/actions/derive.ts`** (522 l.) — L'ActionCenter dérive DÉJÀ une catégorie `relance` (leads acheteur non
  touchés ≥ 7 j, `RELANCE_STALE_DAYS=7`, l. 32/247-273), `proprietaire` (vendeurs à rappeler, l. 276-297),
  `acquereur` sans proposition récente (l. 376-406), `mandat` brouillon (l. 355-370). Chaque item `relance`
  porte un quick action `{ kind: "message", leadId }` (l. 259). **C'est M04-08.** → Ma frontière : M04-08
  décide QUI relancer et affiche la ligne ; il ne produit PAS le CONTENU du message.
- **`components/cockpit/ActionCenter.tsx`** (457 l.) — `handleQuick` sur `message` (l. 345-362) crée juste
  une `rea_tasks` « message à envoyer » **vide** (`title = messageTaskTitle`, `notes = messageTaskNote`),
  commentaire explicite l. 346 : « aucun transport branché → JAMAIS envoyé, c'est un brouillon/à-faire
  tracé ». **Confirmé : le message n'a AUCUN corps rédigé, aucun lien vers Gmail, aucune trace du contenu.**
  → C'est exactement le trou que remplit mon candidat #1.
- **`lib/providers/composio.ts`** — `createGmailDraft(userId, {to, subject, body})` (l. 242-271) =
  action `GMAIL_CREATE_EMAIL_DRAFT`. Docstring l. 240 : « Ne déclenche PAS d'envoi — le brouillon est
  consultable/modifiable dans Gmail ». **C'est LE canal HITL-safe réel.** `createCalendarEvent` (l. 278) et
  `findCalendarEvents` (l. 353) dispo aussi.
- **`lib/agent/tools/composio.ts`** — Le LLM a déjà l'outil `create_email_draft` (l. 311-371) : il SAIT
  créer un brouillon Gmail. **Mais aucune persistance, aucune file, aucun lien avec un lead / un
  prosp_contact_attempt.** Le brouillon part dans Gmail et disparaît du CRM. → #1 ajoute la file
  persistée + la couche non-conversationnelle (boutons dans l'UI, pas via le chat).
- **`app/(dashboard)/leads/[id]/page.tsx`** (547 l.) — La fiche lead affiche identité, budget, critères,
  visites liées, bien lié, enrichissement. **Aucune chronologie unifiée, aucun bloc communication,
  aucune relance.** Les visites sont listées mais isolées ; estimations/matchs/contacts/tâches liés
  au lead ne sont PAS agrégés. → Trou net pour #2.
- **`lib/estimation/continuity.ts`** + **`ContinuityPanel.tsx`** (787 l.) — Continuité estimation →
  propriétaire → mandat → décision (`decision ∈ {en_attente, a_relancer, mandat_signe, refuse, perdu}`,
  `next_action` texte libre, migration 0043). L'agent peut marquer « à relancer » MAIS **rien ne
  génère le message de relance.** → #5 se branche ici et sur la fiche lead.
- **`supabase/migrations/0040_prospection_industrialization.sql`** — `prosp_contact_attempts` (l. 70-97) :
  une ligne par tentative, `canal ∈ {sms,whatsapp,email,phone}`, `statut ∈ {draft,approved,sent,failed,
  replied,opted_out}`, `template_id`/`template_version`/`idempotency_key`/`provider_ref`. **La table de
  suivi de contact EXISTE déjà, orientée démarchage vendeur (prospection).** `prosp_annonce_versions`
  (l. 31-47) = historique prix/statut/surface par annonce → **le prétexte « baisse de prix » est une
  donnée réelle** pour #3. `prosp_optout` (l. 52-67) = registre RGPD.
- **`lib/prospection/contact.ts`** (276 l.) — Garde-fous de contact : `isOptedOut` fail-closed,
  `renderTemplate` refuse tout `{{placeholder}}` non résolu (l. 245-253), `channelDeliverable` (l. 263)
  = un canal n'est « livrable » que si son provider est configuré. **Toute la mécanique brouillon→approuvé
  est déjà pensée, mais côté prospection uniquement.** #1 réutilise ces primitives pour le CRM entrant.
- **`lib/providers/resend-email.ts`** — `sendEmail` complet (l. 6-35), `resendIsConfigured()` = `RESEND_API_KEY`
  présente. Dry-run si absente. **Resend est codé, pas branché en CRM** (juste alertes prospection). Clé
  Resend dispo (SERVICES.md). → Option secondaire ; je privilégie le brouillon Gmail (plus sûr, zéro envoi).
- **`app/(dashboard)/visits/`** — `page.tsx` liste visites (statut/date/durée/bien) ; `VisitForm.tsx` crée
  une visite. **`visits.feedback` existe en DB (0008, l. 91) mais N'EST JAMAIS ni saisi ni affiché
  de façon structurée.** Aucun « compte rendu » nulle part. → Trou net pour #4.
- **`lib/estimation/share.ts`** + **`app/brochure/[token]/page.tsx`** — Token signé jose HS256
  (`REPORT_SHARING_SECRET`, payload `{eid, exp}`, TTL 30 j) + page publique `/brochure/[token]`.
  **Infra de partage public signé réutilisable telle quelle** pour #6 (rapport propriétaire).
- **Migrations** — grep exhaustif : **AUCUNE table de séquence/nurturing/cadence/campaign, AUCUNE table
  de persistance de brouillon de communication CRM** (`rea_drafts`, `contact_drafts`, `message_drafts`
  → néant). Les hits sur « sequence » = séquences SQL. → #1 et #5 introduisent une (petite) table dédiée.

### Matrice de capacités — mon domaine

| Capacité | Statut réel | Preuve |
|----------|-------------|--------|
| Brouillon Gmail (jamais envoyé) | **AVAILABLE, sous-exploité** | `createGmailDraft` + tool `create_email_draft` existent mais seulement via chat, sans file/persistance UI |
| Suivi de contact granulaire (draft→sent) | **AVAILABLE persisté (prospection)** | `prosp_contact_attempts` (0040) — à généraliser au CRM entrant |
| Registre opt-out RGPD | **AVAILABLE persisté** | `prosp_optout` + `isOptedOut` fail-closed |
| Historique prix/statut d'annonce (prétexte réactivation) | **AVAILABLE persisté** | `prosp_annonce_versions` (0040) |
| Décision commerciale estimation (`a_relancer`, `next_action`) | **AVAILABLE persisté** | `0043` + `continuity.ts` |
| Dérivation « qui relancer / propriétaire à rappeler » | **COUVERT M04-08** | `lib/actions/derive.ts` → je ne re-dérive pas, je consomme |
| Email SMS WhatsApp — envoi réel auto | **CONFIG/UNAVAILABLE** | Resend codé non branché CRM ; Twilio/SMS/WA clés absentes → tout reste brouillon |
| Chronologie unifiée lead/bien | **NOUVEAU (réutilisation données existantes)** | Union de tables déjà présentes, zéro nouvelle donnée |
| Compte rendu de visite structuré | **NOUVELLE UI sur colonne existante** | `visits.feedback` existe, jamais exploité |
| Séquence de nurturing multi-étapes | **NOUVELLE (petite table + réutilise brouillon)** | Aucune table cadence aujourd'hui |
| Rapport propriétaire partagé (lien signé) | **NOUVEAU (réutilise infra partage)** | `share.ts` + `/brochure/[token]` généralisables |
| Partage public signé | **AVAILABLE** | `signShareToken`/`verifyShareToken` + page `/brochure/[token]` |

---

## Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---------|-------------------|-----|------|-----------------|
| Follow Up Boss | AI native (2025) : rédige des réponses/relances, l'agent **relit et édite avant envoi** ; Action Plans = séquences drip texte/email/tâche | followupboss.com/features/ai | 2026-07-18 | Prouvé (snippet page features) |
| Follow Up Boss | API ouverte → agents IA custom OpenAI/Anthropic branchables | followupboss.com/features/ai | 2026-07-18 | Prouvé |
| kvCORE / BoldTrail | Nurture « smart » piloté par comportement ; l'IA réécrit objets/contenus ; +15-25 % conversion vs drip générique | insiderealestate.com/kvcore-w · softabase.com/software/crm/kvcore | 2026-07-18 | Inféré (agrégateurs, pas la page éditeur) |
| Lofty (ex-Chime) | Re-scoring auto d'un lead froid qui re-cherche → **alerte pour recontacter au bon moment** ; « Lead Re-engagement Sprint » scanne les leads perdus, identifie ceux qui rebrowsent, envoie une liste perso | lofty.com/real-estate/crm · aitools-directory.com/tools/chime-ai-real-estate-crm | 2026-07-18 | Inféré (page produit + directory ; pas de démo loguée) |
| Lofty | Outil IA (annonce 3 avr. 2026) pour **convertir les contacts CRM en leads vendeurs** | inman.com/2026/04/03/lofty-launches-ai-tool… | 2026-07-18 | Inféré (article Inman 403 sur WebFetch ; titre + snippet de recherche uniquement) |
| Hektor / La Boîte Immo | **Mail de rappel automatique de renouvellement de mandat** au vendeur ; envoi auto aux acquéreurs des biens correspondant à leurs critères (correspondance min. + ancienneté max. paramétrables) | la-boite-immo.com/actualites/la-gestion-de-la-relation-client-est-automatisee-sur-hektor | 2026-07-18 | Prouvé (page éditeur FR) |
| Netty / Modelo Office | **Espace / rapport propriétaire** : le vendeur suit à tout moment les actions menées sur son mandat | netty.fr/logiciel-immobilier/rapport-proprietaire-agence | 2026-07-18 | Prouvé (page éditeur FR) |
| SweepBright + Flatsy | **Comptes rendus de visite auto-complétés pour 100 % des visites** réalisées | sweepbright.com · immo2.pro/…/sweepbright-sassocie-avec-flatsy… | 2026-07-18 | Prouvé (page + article presse FR) |
| SweepBright | Enregistrement auto des activités (appels, emails, messages, visites) sur mobile | sweepbright.com/solution | 2026-07-18 | Prouvé |

**Lecture concurrentielle marquante** : les leaders US (Lofty, kvCORE, FUB) ont TOUS convergé vers
« l'IA rédige, l'humain valide, l'envoi suit un signal comportemental », et Lofty en fait explicitement
un **moteur de réactivation** (avril 2026). Côté FR, Hektor/Netty ont normalisé le **rapport propriétaire**
et le **rappel de renouvellement de mandat**. Azigo a déjà les DONNÉES (versions d'annonces = signal prix,
décision estimation, critères datés) et le CANAL SÛR (brouillon Gmail) — mais **ne rédige rien et ne
persiste aucun brouillon**. Le game-changer n'est pas d'inventer l'IA rédactionnelle (le chat la fait
déjà) : c'est de la **sortir du chat** pour en faire une **file de brouillons validables en un clic**,
adossée à des prétextes réels. C'est le différenciateur immédiatement démontrable.

---

## Candidats

### Candidat 1 — File de brouillons de relance validables en 1 clic (« Boîte de sortie »)

- **Nom court** : Boîte de sortie CRM (brouillons de relance).
- **Problème métier exact** : l'app dit déjà « relancer Jean (non touché depuis 9 j) » mais s'arrête là.
  L'agent doit ouvrir Gmail, retrouver le contexte, rédiger. 80 % des relances ne partent jamais faute de
  temps. Le trou n'est pas « qui » (résolu), c'est « le message, prêt ».
- **Utilisateur concerné** : l'agent (négociateur) au quotidien.
- **Moment du parcours** : traitement de la to-do du matin ; ou depuis une fiche lead.
- **Écran / emplacement précis** : bloc **sous l'ActionCenter sur l'accueil `/`** (pas de nouveau menu) +
  bouton « Préparer le message » sur chaque ligne `relance`/`proprietaire`/`acquereur` de l'ActionCenter
  (remplace le `{kind:"message"}` actuel qui crée une tâche vide) + carte « Communication » sur `/leads/[id]`.
- **Comportement du widget** : liste des brouillons en attente (statut `draft`), chacun avec destinataire,
  objet, aperçu du corps (2 lignes), canal (email d'abord), prétexte (« relance J+9 », « nouveau bien
  matché »). Le corps est pré-rédigé (gabarit + variables réelles : prénom, dernier bien vu, budget) —
  la rédaction fine peut passer par le LLM déjà en place, mais le gabarit déterministe suffit au MVP.
- **Action disponible** : (a) « Créer le brouillon Gmail » → `createGmailDraft` → l'email atterrit dans
  Gmail, l'agent relit/envoie ; (b) « Éditer » (objet/corps) ; (c) « Rejeter » ; (d) « Marquer envoyé »
  (trace manuelle si l'agent a envoyé depuis Gmail).
- **Automatisation éventuelle** : génération du brouillon déclenchée quand l'ActionCenter surface une
  relance (via Inngest `app/api/inngest/route.ts`, déjà présent, ou à la demande). **Jamais d'envoi auto** :
  la génération produit un `draft`, point.
- **Étape de validation humaine** : intégrale. Un `draft` ne devient jamais `sent` sans clic. `createGmailDraft`
  ne fait que déposer dans Gmail (l'agent valide une 2e fois dans Gmail avant envoi réel). Opt-out revérifié
  (`isOptedOut`) avant toute création de brouillon vers un vendeur.
- **Données nécessaires** : lead (nom/email/contexte), motif de relance, gabarit de message.
- **Données DÉJÀ dispo dans le repo** : `leads` (`app/(dashboard)/leads`), items de relance
  (`lib/actions/derive.ts` → `deriveRelances`/`deriveProprietaires`), `createGmailDraft`
  (`lib/providers/composio.ts:242`), gabarits + refus de placeholder (`lib/prospection/contact.ts:245`),
  suivi draft/sent (`prosp_contact_attempts`, 0040), opt-out (`prosp_optout`).
- **Données manquantes** : une petite table `rea_comm_drafts` (ou réutiliser `prosp_contact_attempts` étendu
  d'un `lead_id` déjà présent + un champ `body`/`subject`) pour persister le CONTENU du brouillon côté CRM.
- **Routes / tables / composants concernés** : nouvelle route `app/api/comm/drafts/route.ts` (POST créer,
  GET lister) + `[id]/route.ts` (PATCH statut/édition) ; composant `components/cockpit/DraftOutbox.tsx` ;
  modif `ActionCenter.tsx` (`handleQuick` message → crée un draft rédigé au lieu d'une tâche vide) ;
  réutilise `createGmailDraft`, `isOptedOut`, `renderTemplate`.
- **Dépendances externes** : Composio Gmail (déjà connecté via Profil, statut `connectionStatus`). Aucun
  nouveau fournisseur. Fallback si Gmail non connecté : le brouillon reste dans la boîte de sortie (copier-coller).
- **Taille estimée** : **M (3-5 j)** — 1 table, 2 routes, 1 composant, 3 gabarits, câblage ActionCenter.
- **Risques** : RGPD sur vendeurs (mitigé par `isOptedOut` fail-closed + gabarits sans envoi) ; qualité du
  gabarit (mitigé : humain relit 2×). Aucun risque d'envoi non consenti (jamais d'envoi automatique).
- **Preuve concurrentielle** : FUB « AI-drafted messages, review and edit before sent » (prouvé) ; kvCORE
  nurture piloté comportement (inféré).
- **Scénario de démo** : accueil → « 5 brouillons prêts » → clic « Créer le brouillon Gmail » sur la relance
  de Jean → ouvrir Gmail → l'email est là, complet, nominatif → envoyer. 15 secondes vs 5 minutes.
- **Indicateur de succès** : nb de brouillons créés / semaine ; taux draft→envoyé ; délai médian
  « relance surfacée → message parti ».

**Décompte score** : impact business 23/25 · utilité quotidienne 20/20 · effet démontrable 14/15 ·
avantage agentique 13/15 · faisabilité 12/15 (1 table + câblage) · dispo données 9/10.
Pénalités : 0 (pas de refonte, pas d'infra majeure, canal réel présent, opt-out géré). **Brut 91 → net 88.**

---

### Candidat 2 — Chronologie unifiée lead / bien (timeline)

- **Nom court** : Chronologie unifiée (client & bien).
- **Problème métier exact** : l'histoire d'un client (ou d'un bien) est éclatée sur 5 écrans (visites,
  estimations, matchs, contacts, tâches). Avant un appel, l'agent perd 3 min à reconstituer « où on en est ».
- **Utilisateur concerné** : l'agent avant chaque interaction client ; le manager en revue.
- **Moment du parcours** : ouverture d'une fiche lead/bien avant un appel/RDV.
- **Écran / emplacement précis** : nouvel onglet/section **« Historique » sur `/leads/[id]`** (la fiche
  n'en a aucun aujourd'hui) et symétriquement sur `/properties/[id]`. Aucun nouveau menu top-level.
- **Comportement du widget** : flux vertical antéchronologique fusionnant, pour l'entité : visites
  (`visits`), estimations liées (`estimations.owner_lead_id`/`property_id`), matchs
  (`prosp_matchs` via critère du lead), tentatives de contact (`prosp_contact_attempts.lead_id`),
  tâches (`rea_tasks` polymorphe `entity_type`/`entity_id`), changements d'annonce
  (`prosp_annonce_versions` si le bien est suivi). Chaque item : icône, date, libellé, lien vers le détail.
- **Action disponible** : filtrer par type ; cliquer un item → sa fiche ; bouton « Ajouter une note »
  (rea_tasks kind=note) ; « Préparer un message » (→ candidat 1).
- **Automatisation éventuelle** : aucune (lecture pure). C'est une VUE — donc zéro risque.
- **Étape de validation humaine** : sans objet (lecture seule).
- **Données nécessaires** : les tables ci-dessus, toutes owner-scopées user+tenant.
- **Données DÉJÀ dispo dans le repo** : `visits`/`estimations`/`prosp_matchs`/`prosp_contact_attempts`/
  `rea_tasks`/`prosp_annonce_versions` — toutes présentes et indexées ; la fiche lead charge déjà visites +
  critères (`app/(dashboard)/leads/[id]/page.tsx:139-170`). `entity_type`/`entity_id` sur `rea_tasks`
  (0043) rend le rattachement trivial.
- **Données manquantes** : aucune. Pur travail d'union + tri + rendu.
- **Routes / tables / composants concernés** : `lib/crm/timeline.ts` (fonction pure d'union/tri, testable
  comme `lib/actions/derive.ts`) ; composant `components/cockpit/Timeline.tsx` ; intégration dans les 2 pages
  détail (server components qui lisent déjà en `Promise.all`).
- **Dépendances externes** : aucune.
- **Taille estimée** : **M (3-5 j)** — l'union multi-tables + dédup + rendu responsive + tests.
- **Risques** : performance si beaucoup de lignes (mitigé : `LIMIT` par source + index déjà posés,
  cf. `0034_composite_indices`). Aucun risque produit.
- **Preuve concurrentielle** : SweepBright « enregistrement auto des activités (appels/emails/messages/
  visites) » sur une timeline (prouvé) ; standard implicite de tout CRM haut de gamme.
- **Scénario de démo** : ouvrir la fiche d'un vendeur → onglet Historique → « estimation 320k€ le 2/6 →
  mandat brouillon → 2 visites → feedback → dernier contact il y a 12 j ». Toute l'histoire, un écran.
- **Indicateur de succès** : temps passé sur la fiche avant appel (proxy : profondeur de scroll / clics
  vers sous-fiches en baisse) ; adoption de l'onglet.
- **Frontière M04** : M04-11 (« CRM/portefeuille denses ») fait de la **densité d'affichage** des champs
  existants ; ici c'est une **capacité nouvelle** (agrégation cross-tables inexistante), pas du polish de
  fiche. À coordonner pour que la timeline s'insère dans la fiche dense de M04-11 sans doublon.

**Décompte score** : impact 20/25 · utilité 19/20 · effet démontrable 14/15 · agentique 8/15 (vue, peu
d'agent) · faisabilité 15/15 (zéro dépendance, données là) · dispo données 10/10.
Pénalités : 0. **Brut 86 → net 85.**

---

### Candidat 3 — Réactivation des leads froids à prétexte réel

- **Nom court** : Réactivation froide (prétexte concret).
- **Problème métier exact** : les leads dormants sont de l'argent qui dort. Les relancer « à froid » sans
  raison est inefficace et intrusif. Il faut un **prétexte factuel** — que l'agent n'a jamais le temps de chercher.
- **Utilisateur concerné** : l'agent ; particulièrement rentable sur les gros portefeuilles.
- **Moment du parcours** : session de prospection hebdo ; ou push depuis l'accueil.
- **Écran / emplacement précis** : nouveau panneau **dans `/prospection` (onglet Feedback ou nouvel onglet
  « Réactivation »)** + carte de synthèse sur l'accueil `/`. Réutilise un écran existant.
- **Comportement du widget** : liste de leads froids (acheteur : `updated_at` ancien, statut ouvert ;
  vendeur : estimation `decision='a_relancer'`), chacun assorti d'un **prétexte réel détecté** :
  - **Baisse de prix** sur un bien qui matchait ses critères → `prosp_annonce_versions` (delta prix).
  - **Nouveau bien matché** depuis le dernier contact → `prosp_matchs` récents pour son critère.
  - **Anniversaire de recherche** → `prosp_criteres_acquereur.created_at` (X mois pile).
  Chaque ligne : « Sophie — cherche T3 Lyon 3e depuis 6 mois ; **2 nouveaux biens** sous son budget ».
- **Action disponible** : « Préparer le message » (→ candidat 1, brouillon avec le prétexte injecté) ;
  « Ouvrir la fiche » ; « Reporter ». 
- **Automatisation éventuelle** : détection des prétextes en batch (Inngest). **Aucun envoi** : produit une
  suggestion + un brouillon à valider.
- **Étape de validation humaine** : intégrale (le brouillon suit le flux du candidat 1). Opt-out respecté.
- **Données nécessaires** : leads froids, versions d'annonces, matchs, dates de critères.
- **Données DÉJÀ dispo dans le repo** : `prosp_annonce_versions` (0040, delta prix RÉEL, indexé
  `annonce_id, observed_at desc`), `prosp_matchs`, `prosp_criteres_acquereur.created_at`
  (`0016`), `leads.updated_at`, `estimations.decision` (0043). Seuils de fraîcheur déjà définis
  (`ACQUEREUR_STALE_DAYS`, `MATCH_RECENT_DAYS` dans `lib/actions/derive.ts`).
- **Données manquantes** : aucune donnée nouvelle ; juste la logique de corrélation lead↔signal.
- **Routes / tables / composants concernés** : `lib/crm/reactivation.ts` (détection pure) ;
  `app/api/crm/reactivation/route.ts` ; panneau dans `app/(dashboard)/prospection/_components/` ;
  s'appuie sur candidat 1 pour le brouillon.
- **Dépendances externes** : aucune (Gmail brouillon via #1).
- **Taille estimée** : **M (3-5 j)**.
- **Risques** : faux prétexte si donnée périmée (mitigé : n'afficher que des deltas horodatés récents) ;
  RGPD (mitigé : opt-out + brouillon jamais envoyé). 
- **Preuve concurrentielle** : Lofty « Lead Re-engagement Sprint » + re-scoring d'un froid qui re-cherche +
  outil avril 2026 pour convertir contacts CRM en vendeurs (inféré) ; c'est LA tendance 2026.
- **Scénario de démo** : onglet Réactivation → « 3 leads à réveiller : baisse de −15k€ sur un bien matché
  pour Karim » → Préparer le message → brouillon « Le bien X que vous aviez repéré vient de baisser… ».
- **Indicateur de succès** : nb de réactivations initiées ; taux de réponse ; leads froids repassés « actif ».

**Décompte score** : impact 24/25 · utilité 16/20 (hebdo plus que quotidien) · effet démontrable 14/15 ·
agentique 14/15 · faisabilité 13/15 · dispo données 9/10. Pénalités : 0. **Brut 90 → net ~83** (léger
retrait utilité quotidienne). **83.**

---

### Candidat 4 — Compte rendu de visite structuré → brouillon vendeur

- **Nom court** : Compte rendu de visite (débrief + brouillon propriétaire).
- **Problème métier exact** : après une visite, le retour au vendeur est souvent oral, tardif ou oublié.
  Or c'est LE moment qui rassure le propriétaire et justifie le mandat. `visits.feedback` existe mais n'est
  jamais rempli ni exploité.
- **Utilisateur concerné** : l'agent, juste après une visite (mobile/desktop).
- **Moment du parcours** : visite passée (`status='realisee'`), ou clôture d'une visite.
- **Écran / emplacement précis** : bloc « Compte rendu » sur **`/visits`** (sur une visite réalisée) et
  reprise sur la fiche du **bien** et du **lead vendeur**. Pas de nouveau menu.
- **Comportement du widget** : formulaire court structuré — intérêt (chaud/tiède/froid), points positifs,
  objections, retour sur le prix, suite envisagée. Sauvegarde dans `visits.feedback` (structuré en JSON léger
  ou texte) + bouton « Préparer le compte rendu propriétaire » → brouillon d'email au vendeur reprenant les
  points (via candidat 1 / `createGmailDraft`).
- **Action disponible** : enregistrer le débrief ; générer le brouillon vendeur ; créer une tâche de suite
  (rea_tasks) ; ajuster le prix (renvoie vers l'ajustement manuel d'estimation existant, `ContinuityPanel`).
- **Automatisation éventuelle** : rappel « débrief à faire » après une visite passée (déjà dérivable via
  ActionCenter / une tâche). **Aucun envoi auto.**
- **Étape de validation humaine** : le compte rendu vendeur reste un brouillon (flux candidat 1).
- **Données nécessaires** : visite, bien, vendeur, feedback.
- **Données DÉJÀ dispo dans le repo** : `visits` (+ colonne `feedback` inexploitée, 0008), lien
  `visits.lead_id`/`property_id`, vendeur via `leads` (kind=vendeur), `rea_tasks` pour la suite.
- **Données manquantes** : structuration de `feedback` (colonne présente ; on y met un JSON léger — pas de
  migration bloquante, ou un `visit_feedback jsonb` additif).
- **Routes / tables / composants concernés** : `app/api/visits/[id]/route.ts` (PATCH feedback) ;
  composant `VisitDebrief.tsx` dans `app/(dashboard)/visits/_components/` ; réutilise candidat 1.
- **Dépendances externes** : Composio Gmail (brouillon). Aucune autre.
- **Taille estimée** : **S (1-2 j)** — 1 formulaire, 1 route PATCH, réutilisation du brouillon.
- **Risques** : faible. Qualité rédactionnelle du brouillon (humain relit).
- **Preuve concurrentielle** : SweepBright + Flatsy « comptes rendus auto pour 100 % des visites » (prouvé) ;
  Netty « rapport propriétaire » (prouvé). Standard FR attendu.
- **Scénario de démo** : visite réalisée → 4 champs cochés/saisis → « Préparer le compte rendu » → brouillon
  « Suite à la visite de ce jour, le visiteur a apprécié… mais trouve le prix élevé… » prêt pour le vendeur.
- **Indicateur de succès** : % de visites réalisées avec débrief ; nb de comptes rendus vendeur envoyés ;
  corrélation avec renouvellement de mandat.
- **Frontière M04** : M04-08 gère l'agenda/l'accueil (surfacer « visite passée ») ; M04-10 la continuité
  commerciale estimation. Ici = **capture structurée + communication vendeur**, nouvelle, pas couverte.

**Décompte score** : impact 21/25 · utilité 17/20 · effet démontrable 13/15 · agentique 12/15 ·
faisabilité 14/15 · dispo données 8/10 (colonne présente, à structurer). Pénalités : 0. **Brut 85 → net 82.**

---

### Candidat 5 — Séquence de nurturing à étapes approuvables (cadence de relance)

- **Nom court** : Cadence de relance (nurturing multi-étapes validé).
- **Problème métier exact** : un lead qui ne signe pas tout de suite se perd faute de suivi régulier sur
  la durée. Les CRM leaders ont des « drip sequences » ; Azigo n'a qu'une relance ponctuelle (ActionCenter).
- **Utilisateur concerné** : l'agent qui gère un pipeline de moyen/long terme (vendeurs hésitants,
  acheteurs pas prêts).
- **Moment du parcours** : après une estimation « à relancer », après un premier contact sans suite.
- **Écran / emplacement précis** : bloc « Suivi programmé » sur **`/leads/[id]`** + reprise dans
  l'ActionCenter (l'étape due du jour remonte comme relance). Pas de nouveau menu.
- **Comportement du widget** : l'agent applique une cadence (ex. « Vendeur hésitant » = J+2 nouvelles,
  J+15 étude de marché, J+45 point prix). Chaque étape crée, **à échéance**, un brouillon à valider (candidat 1)
  — pas un envoi. L'agent voit la timeline des étapes (faites / à venir / due).
- **Action disponible** : choisir une cadence ; sauter/décaler une étape ; à échéance, « Préparer le
  brouillon » ; arrêter la cadence.
- **Automatisation éventuelle** : à l'échéance d'une étape, génération d'un `draft` (Inngest). **L'échéance ne
  déclenche JAMAIS un envoi**, seulement l'apparition d'un brouillon dans la boîte de sortie / l'ActionCenter.
- **Étape de validation humaine** : par construction, chaque étape = une validation (flux candidat 1). Opt-out
  vérifié à chaque génération. Arrêt immédiat possible.
- **Données nécessaires** : lead, définition de cadence, état des étapes.
- **Données DÉJÀ dispo dans le repo** : `leads`, `estimations.decision='a_relancer'`/`next_action` (0043),
  `rea_tasks` (peut porter les étapes via `kind`/`due_at`/`entity_id`), `createGmailDraft`. La logique de
  « due aujourd'hui » existe déjà (`lib/actions/derive.ts:deriveTodayTasks`).
- **Données manquantes** : une table `rea_cadences` + `rea_cadence_steps` (ou modéliser les étapes comme des
  `rea_tasks kind=relance` planifiées + une petite table de définition). Cadences par défaut en `config/`.
- **Routes / tables / composants concernés** : `lib/crm/cadence.ts` (définitions + moteur d'étapes),
  `app/api/crm/cadences/route.ts`, composant `CadencePanel.tsx` sur la fiche lead ; réutilise candidat 1 +
  `rea_tasks`.
- **Dépendances externes** : Composio Gmail (brouillon), Inngest (planif — route déjà présente).
- **Taille estimée** : **M (3-5 j)** — moteur d'étapes + UI + intégration ActionCenter. (Dépend de candidat 1.)
- **Risques** : complexité perçue (mitigé : 2-3 cadences pré-définies, pas un éditeur libre au MVP) ;
  RGPD (mitigé : brouillon + opt-out). Risque de sur-ingénierie si on vise l'éditeur complet → rester sur des
  cadences fixes (tranche M autonome).
- **Preuve concurrentielle** : FUB Action Plans (séquences drip texte/email/tâche, prouvé) ; kvCORE smart
  nurture (inféré). Table-stakes des CRM haut de gamme.
- **Scénario de démo** : fiche d'un vendeur hésitant → appliquer cadence « Suivi vendeur » → J+2 le premier
  brouillon apparaît dans la boîte de sortie → validé → étape suivante programmée.
- **Indicateur de succès** : nb de leads sous cadence ; nb d'étapes validées ; taux de conversion des leads
  sous cadence vs hors cadence.

**Décompte score** : impact 21/25 · utilité 16/20 · effet démontrable 12/15 · agentique 13/15 ·
faisabilité 11/15 (dépend de #1 + 2 tables) · dispo données 8/10. Pénalités : 0. **Brut 81 → net 76**
(retrait pour dépendance à #1 et volume). **76.**

---

### Candidat 6 — Espace propriétaire / rapport de mandat partagé (lien signé)

- **Nom court** : Rapport propriétaire partagé.
- **Problème métier exact** : le vendeur appelle sans cesse « alors, ça avance ? ». L'agent perd du temps
  et le vendeur doute → risque de non-renouvellement / mandat qui part à la concurrence.
- **Utilisateur concerné** : l'agent (gain de temps) et le vendeur (transparence).
- **Moment du parcours** : mandat actif, entre deux points téléphoniques.
- **Écran / emplacement précis** : bouton « Générer un lien propriétaire » sur **`/mandates/[id]`** →
  page publique **`/rapport/[token]`** (calquée sur `/brochure/[token]` existante). Pas de nouveau menu interne.
- **Comportement du widget** : page publique signée (lecture seule) montrant au vendeur, pour SON bien :
  nb de visites réalisées, prochaines visites, comptes rendus non nominatifs (candidat 4), historique de prix,
  actions menées. Côté agent : bouton pour (re)générer/révoquer le lien + « Envoyer le lien » (brouillon Gmail).
- **Action disponible** : générer/copier le lien ; préparer un brouillon d'email au vendeur avec le lien ;
  révoquer (TTL).
- **Automatisation éventuelle** : rappel « rapport à envoyer » périodique (option) ; **jamais d'envoi auto**.
- **Étape de validation humaine** : l'envoi du lien passe par un brouillon (candidat 1). La page est en
  lecture seule et ne montre que des données du mandat concerné.
- **Données nécessaires** : mandat, bien, visites, comptes rendus, versions de prix.
- **Données DÉJÀ dispo dans le repo** : `mandates` (`signed_at`/`expires_at`, 0008), `visits`,
  `properties`, `prosp_annonce_versions`, `visits.feedback` (candidat 4). Infra de partage :
  `lib/estimation/share.ts` (token jose signé, `REPORT_SHARING_SECRET`) + page `app/brochure/[token]/page.tsx`
  → **généralisables tels quels**.
- **Données manquantes** : aucune donnée métier nouvelle ; généralisation du token (`{mid}` au lieu de `{eid}`)
  et une page de rendu.
- **Routes / tables / composants concernés** : `lib/mandate/share.ts` (calqué sur `estimation/share.ts`),
  `app/rapport/[token]/page.tsx` (calqué sur brochure), bouton sur `app/(dashboard)/mandates/[id]`.
- **Dépendances externes** : aucune (le lien est public signé ; l'envoi = brouillon Gmail).
- **Taille estimée** : **M (3-5 j)** — généraliser le token + page publique + assemblage des données du mandat.
- **Risques** : fuite de données via lien (mitigé : token signé + TTL + révocation, données strictement du
  mandat, comptes rendus anonymisés côté visiteur). RGPD (données du seul vendeur destinataire).
- **Preuve concurrentielle** : Netty/Modelo « espace/rapport propriétaire » (prouvé) ; Hektor rappel
  renouvellement mandat (prouvé). Attente forte du marché FR.
- **Scénario de démo** : mandat actif → « Générer un lien propriétaire » → ouvrir le lien → le vendeur voit
  3 visites, 2 comptes rendus, la baisse de prix décidée → « Préparer l'email » → brouillon prêt.
- **Indicateur de succès** : nb de rapports générés ; réduction des appels « ça avance ? » (proxy :
  fréquence des tâches d'appel entrant) ; taux de renouvellement de mandat.
- **Frontière M04** : M04-12 durcit le partage brochure d'estimation ; ici c'est un **objet nouveau** (rapport
  de MANDAT en continu), pas le même artefact ni le même écran.

**Décompte score** : impact 20/25 · utilité 14/20 (périodique) · effet démontrable 13/15 · agentique 9/15 ·
faisabilité 13/15 · dispo données 9/10. Pénalités : 0. **Brut 78 → net 72.**

---

## Idées rejetées

- **Envoi automatique d'emails/SMS de relance (sans brouillon)** — viole la règle dure (communication
  auto interdite) ; SMS/WhatsApp non câblés (Twilio absent). Éliminé.
- **Chatbot/SDR IA qui répond seul aux leads 24/7 (façon Lofty AI Assistant)** — envoi non validé + risque
  de réponse erronée non auditée ; gadget conversationnel sans HITL. Éliminé (règle dure + faible faisabilité).
- **Two-way texting / boîte SMS intégrée dans le CRM** — dépendance Twilio indisponible (−15) ; hors périmètre
  canal réel. Éliminé.
- **Scoring de température de lead par tracking comportemental web (page views, email opens)** — nécessite un
  pixel/tracking web non présent (pas de site IDX ni d'ouverture email trackée) ; données non accessibles (−15).
  Éliminé (et proche du domaine d'Opus 01 sur la priorisation).
- **Prochaines meilleures actions / hot-list quotidienne** — appartient à Opus 01 + M04-08 (ActionCenter).
  Éliminé (frontière).
- **Fiche lead dense (regroupement visuel des champs)** — c'est M04-11 (densité UI CRM). Éliminé (doublon M04).
- **Capture vocale d'un compte rendu de visite au dictaphone** — appartient à Opus 08 (capture terrain/vocale) ;
  je garde la STRUCTURE + la communication (candidat 4), pas la saisie vocale. Frontière respectée.
- **Éditeur complet de séquences drag-and-drop (workflow builder)** — XL, sur-ingénierie ; réduit à des
  cadences fixes (candidat 5). Éliminé en tant que tel.
- **Signature électronique de mandat / e-sign intégré** — hors domaine (transaction/documents), dépendance
  externe (DocuSign/Yousign) absente. Éliminé.
- **Génération d'annonces marketing (portails) / multidiffusion** — hors domaine relationnel ; pas de canal
  portail branché. Éliminé.
- **Anniversaire d'achat / date de déménagement comme déclencheur** — donnée non capturée (`leads` n'a ni date
  d'achat ni date d'emménagement) ; données manquantes (−15). Réduit à « anniversaire de RECHERCHE » (donnée
  réelle `prosp_criteres_acquereur.created_at`) intégré au candidat 3.
