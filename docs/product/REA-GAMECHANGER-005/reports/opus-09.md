# REA-GAMECHANGER-005 — Rapport OPUS 09

**Domaine : Expérience client & partage** (surfaces publiques signées pour VENDEURS & ACQUÉREURS,
sans portail 6 mois, sans compte GoTrue). Pattern socle vérifié : lien public signé
`/brochure/[token]` + JWT `lib/estimation/share.ts` + rendu `lib/brochure/` + email best-effort Resend.

---

## Synthèse coordinateur

| Candidat | Écran | Taille | Score | Données prêtes (O/P/N) | Effet business (1 ligne) |
|---|---|---|---|---|---|
| **Sélection acquéreur partagée + retour 👍/👎** | `/prospection` (onglet matching) + `/leads/[id]` | M | **88** | O | L'acquéreur trie lui-même une sélection reçue par lien ; l'agent visite les bons biens et gagne du temps. |
| **Rapport de commercialisation vendeur (lien signé)** | `/mandates/[id]` + `/properties/[id]` | M | **85** | P | Le vendeur voit visites/offres/actions en temps réel → mandat exclusif conservé, moins d'appels « ça avance ? ». |
| **Dossier de bien partageable (mini-vitrine signée)** | `/properties/[id]` (bouton « Partager ») | S | **82** | O | Un lien propre photos+DPE+descriptif à envoyer à un acquéreur en 5 s, sans PII agence exposée. |
| **Fiche pratique de visite (envoi avant RDV)** | `/visits` + `/properties/[id]` | S | **76** | O | Adresse, accès, checklist, points-clés envoyés avant la visite → moins de no-show, visite plus pro. |
| **Compte rendu de visite partageable au vendeur** | `/visits` (feedback existant) | S | **74** | O | Le retour de visite déjà saisi devient un lien propre pour le vendeur → preuve d'activité, réassurance. |
| **Registre de partages + révocation (centre de liens)** | `/properties/[id]` / réglages bien | S | **72** | P | Un endroit pour voir/révoquer tous les liens émis → conformité RGPD et maîtrise de la diffusion. |

*Tous ≥70. Classés par score. E-signature volontairement absente de la shortlist (dépendance externe indispo −15, voir Idées rejetées).*

---

## Lecture du terrain

Vérifié dans le worktree (lecture seule) :

- **Socle de partage signé** — `lib/estimation/share.ts` : `signShareToken(id, ttl=30j)` / `verifyShareToken(token)`
  en **jose HS256**, secret `REPORT_SHARING_SECRET`, payload minimal `{ eid, exp }`. C'est un patron
  générique : rien n'y est spécifique à l'estimation sauf la clé `eid`. Un second type de token
  (`kind:'selection'|'seller_report'|'property'`) se greffe sans nouvelle infra.
- **Page publique** — `app/brochure/[token]/page.tsx` : hors `(dashboard)`, **aucune session**, autorisation
  portée par le token, `noindex,nofollow,noarchive`, vérifie `status==='ready'` via service-role.
  **Seule route session-less applicative** confirmée (grep `getSession` sur `app/api/**` : seuls
  `brochure/[token]/pdf`, gateway à clé, et callbacks sont publics). Mes surfaces sont donc réellement neuves.
- **Livraison email RÉELLE** — `app/api/estimations/[id]/share/route.ts` envoie déjà le lien par **Resend**
  (`resend.emails.send`, best-effort, `RESEND_FROM_EMAIL`), et `lib/providers/resend-email.ts`
  (`sendEmail`, dry-run si non configuré). ⚠️ Nuance clé vs brief : l'email transactionnel de partage
  **fonctionne aujourd'hui** ; ce sont les *alertes prospection WhatsApp/SMS* (`lib/prospection/alert.ts`,
  `alerts/dispatch`) qui restent « aperçu ». Donc « envoyer un lien au client par email » = dispo.
- **Retour client → schéma existant** — migration `0017_prosp_matchs_feedback.sql` :
  `prosp_matchs (critere_id×annonce_id, score_match, score_breakdown, features_snapshot)` **UNIQUE
  (tenant,critere,annonce)** ; `prosp_match_feedback.signal` **CHECK IN ('like','dislike','contact','visite')**.
  `lib/prospection/feedback.ts::normalizeSignal` mappe déjà 👍→`like` / 👎→`dislike`. **Le verdict d'un
  acquéreur s'écrit dans la colonne existante `signal`** — aucune table neuve pour capter le retour
  (une colonne `source='client'` optionnelle suffit à distinguer agent vs client). C'est la découverte
  structurante du domaine.
- **Matchs déjà enrichis pour l'affichage** — `app/api/prospection/matchs/route.ts` (GET) joint
  `prosp_annonces(titre,prix,surface,pieces,ville,dpe,photos,url)`, calcule `explanation`
  (`lib/prospection/explain.ts`) et `recommandation`. Le mapping `mapAnnonce()` est directement
  réutilisable pour une **vue publique** de la sélection (en retirant `url` source / `raw` / breakdown interne).
- **Bien = matière riche + photos R2** — `0008_crm.sql` (properties: type, surface, pièces, prix,
  adresse, statut) + `0018_property_photos.sql` (galerie R2, `is_cover`, `position`, enrichissements
  DPE/GES/étage/équipements). `lib/storage/r2.ts` expose `publicUrl` + **`presignedUrl(key,ttl)`**
  (SigV4 query-string, lien GET expirant) : parfait pour servir des documents privés dans un lien signé
  sans ouvrir le bucket. Upload prouvé dans `app/api/properties/[id]/photos/route.ts` (magic-bytes, cap).
- **Vendeur / commercialisation traçables ?** — `visits` (`scheduled_at`, `status`
  planifiee→realisee→no_show, `feedback`, `duration_min`), `mandates` (`status`, `signed_at`,
  `expires_at`, `commission_pct`), `properties.status` (prospect→en_vente→sous_offre→vendu),
  `prosp_matchs` (biens proposés). **Traçable en interne** : visites, retours de visite, changements de
  statut, offres implicites (`sous_offre`), diffusion. **NON traçable** : vues portails externes,
  ouvertures du lien (aucune table `*_view`/`opened_at` — grep vide). → un rapport vendeur honnête montre
  *l'activité de l'agent*, pas des « X vues Leboncoin » qu'on n'a pas.
- **Acquéreur joignable** — `0016_prosp_prospects_criteres.sql` : `prosp_criteres_acquereur.lead_id → leads`
  + `telephone` ; `leads.email`/`leads.phone` (`0008`). Donc destinataire d'un envoi = connu et consenti
  (lead qualifié), `prosp_optout` respecté.
- **Seam agentique** — `app/api/agent-gateway/v1/alerts/{prepare,dispatch}` + `agent_alert_approvals`
  (0045, fail-closed, HITL) : la génération d'une sélection/rapport peut être *préparée* par un agent
  Aigent et *validée* par l'humain avant envoi, via la gateway existante (pas de moteur interne).

### Matrice de capacités — domaine « expérience client & partage »

| Capacité | Statut réel | Preuve (fichier) |
|---|---|---|
| Token public signé (jose HS256, TTL, révocable par exp) | **AVAILABLE, réutilisable tel quel** | `lib/estimation/share.ts` |
| Page publique sans session + noindex | **AVAILABLE (patron)** | `app/brochure/[token]/page.tsx` |
| Envoi email d'un lien au client | **AVAILABLE (Resend live + dry-run)** | `app/api/estimations/[id]/share/route.ts`, `lib/providers/resend-email.ts` |
| Retour client 👍/👎 sur des biens | **AVAILABLE sous-exploité** (schéma prêt, aucune surface client) | `0017_prosp_matchs_feedback.sql`, `lib/prospection/feedback.ts` |
| Sélection acquéreur (matchs joints + explication) | **AVAILABLE côté agent, pas partagée** | `app/api/prospection/matchs/route.ts` |
| Galerie bien / documents privés servis par lien | **AVAILABLE** (`publicUrl` + `presignedUrl`) | `lib/storage/r2.ts`, `.../photos/route.ts` |
| Données commercialisation vendeur (visites/offres/statut) | **AVAILABLE en interne**, jamais agrégées ni partagées | `0008_crm.sql` |
| Compteur de vues / ouverture de lien | **UNAVAILABLE** (aucune table de tracking) | grep `*_view`/`opened_at` → vide |
| Vues portails externes (Leboncoin/SeLoger…) | **UNAVAILABLE** (pas de MLS/portail branché) | brief + absence code |
| Signature électronique | **UNAVAILABLE** (aucune brique ; dépend. externe Yousign/DocuSign) | grep docusign/yousign → vide |
| Tracking engagement **brochure estimation** | **COUVERT — Opus 04** (frontière ci-dessous) | — |
| Compte rendu de visite (production du contenu) | **COUVERT — Opus 08** (moi = le rendre partageable) | — |
| Durcissement partage estimation existant | **COUVERT — M04-12** | brief |

**Frontières explicites.** Opus 04 possède le *tracking d'engagement de la brochure estimation existante*
(ouverture/scroll → conversion mandat) → je n'y touche pas ; je crée les **nouvelles surfaces** (sélection
acquéreur, rapport vendeur, dossier bien, fiche visite). Opus 08 *produit* le compte rendu de visite → je le
*rends partageable* au vendeur (candidat 5), sans dupliquer sa saisie. M04-12 = *durcit* le partage estimation
(providers/provenance/PDF) → aucun de mes candidats ne re-fait le partage estimation ; ils l'ÉTENDENT à d'autres
objets métier.

---

## Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---|---|---|---|---|
| **RealScout** | Boutons « Interested / not interested » sur chaque annonce d'un flux partagé ; l'agent « voit instantanément » ; consolidation en liste ; messages agent par annonce | support.realscout.com/en/articles/11954631 ; support.realscout.com/en/articles/11954667 | 2026-07-18 | **Prouvé** (page support détaillée) |
| RealScout | Positionnement « make your database your #1 profit center », recherche collaborative brandée sans pub concurrente | realscout.com | 2026-07-18 | Prouvé (home) |
| **Hektor (La Boîte Immo)** | « Espace Propriétaire » : le vendeur suit **en temps réel** toutes les actions du mandat — publication sur portails, **visites**, **offres d'achat, acceptations/refus** ; reporting auto par bien/acquéreur/vendeur mis à jour à chaque action ; **rapport de visite envoyé en 1 clic** ; extranet acquéreur sécurisé | la-boite-immo.com/actualites/lespace-proprietaire-sur-hektor-… ; /logiciel-immobilier/gestion-contacts | 2026-07-18 | **Prouvé** (pages produit + actu) — 8 500 agences |
| **Modelo (ex-Netty)** | « Espace propriétaire » consultable **en ligne à tout moment** (identifiants par email) : détails **visites**, **propositions reçues**, **portails diffusant l'annonce** ; **rapport téléchargeable en PDF** | modelo.fr/logiciel-immobilier/rapport-proprietaire-agence | 2026-07-18 | **Prouvé** (fetch page) — ⚠️ **aucun chiffre de vues** annoncé (confirme la limite honnête) |
| **Apimo** | Extranet = espace partagé centralisant, pour vendeur ET acquéreur, propositions de biens, visites, dates de compromis, DPE, messages ; suivi d'activité en temps réel ; stockage sécurisé des documents | getapp.com/…/apimo ; apimo.net/fr/logiciel | 2026-07-18 | Prouvé (fiche + site) |
| **SweepBright** | Matching mobile → envoi d'un bien au prospect en 1 clic par email ; profils acquéreurs présentables sur site | sweepbright.com/solution | 2026-07-18 | Prouvé (page solution) — espace client dédié **non confirmé** (dit honnêtement) |
| **Yousign / e-signature** | Signature électronique mandats/compromis/offres, valeur légale eIDAS + art. 1367 ; **85 % ventes / 90 % baux** signés électroniquement en grandes agences FR 2026 | yousign.com/agency-agreement ; e-signature.eu/en/…real-estate | 2026-07-18 | Prouvé (page dédiée + article marché) |
| **DocuSign + Claude** | Intégration (24 févr. 2026) : préparer un mandat, l'envoyer en signature, suivre le statut sans intervention manuelle ; accès anticipé DocuSign Business Pro | docusign.com/solutions/industries/real-estate ; ia-lab-immo.com/blog/claude-cowork-docusign-… | 2026-07-18 | Prouvé (annonce) — **dépendance externe** pour nous |

**Lecture stratégique.** L'espace propriétaire ET la recherche collaborative acquéreur sont des **standards
marché en France** (Hektor 8 500 agences, Modelo, Apimo). Azigo n'a **rien** des deux côté client → c'est le
plus grand *gap perçu* réparable vite sur le pattern lien signé, sans construire de portail lourd. Découverte
la plus utile : **personne (Modelo/Hektor sur page publique) ne prouve de compteur de vues portails** — ils
montrent l'**activité de l'agent**. On peut donc égaler l'attendu du marché **avec exactement les données
qu'on a** (visites/offres/statut), sans mentir sur des vues qu'on ne mesure pas.

---

## Candidats

### 1. Sélection acquéreur partagée avec retour interactif 👍/👎 — Score **88** — Taille M

- **Nom court** : Sélection acquéreur partagée (« ma sélection »).
- **Problème métier exact** : l'agent envoie aujourd'hui des biens à un acquéreur par email/WhatsApp au
  fil de l'eau (liens portails bruts, aucune remontée structurée). Il ne sait pas ce qui plaît, relance à
  l'aveugle, organise des visites sur des biens que l'acquéreur aurait écartés. Perte de temps des deux côtés.
- **Utilisateur concerné** : agent (émetteur) + acquéreur/lead (destinataire, sans compte).
- **Moment du parcours** : après le matching prospection ou une qualification lead, quand l'agent a 3–10 biens
  pertinents à soumettre.
- **Écran/emplacement précis** : `/prospection` onglet matching (bouton « Constituer une sélection » sur les
  matchs cochés d'un même `critere_id`) **et** `/leads/[id]` (« Envoyer une sélection »). Vue publique :
  nouvelle route `app/selection/[token]/page.tsx` (jumelle de `app/brochure/[token]`). **Aucun menu top-level.**
- **Comportement du widget** : côté agent, sélection multiple de matchs → « Créer le lien ». Côté client, page
  publique responsive : cartes de biens (photo cover, prix, surface, pièces, ville, DPE, phrase d'explication
  « pourquoi ce bien »), chacune avec **👍 / 👎 / champ commentaire court**. Pas de PII agence hors nom + moyen
  de contact choisi. Bandeau « lien privé, valable 30 j ».
- **Action disponible** : l'acquéreur vote 👍/👎 et commente par bien ; l'agent voit la synthèse en temps réel
  (retenus / écartés / commentaires) sur l'onglet feedback existant.
- **Automatisation éventuelle** : un agent Aigent peut *préparer* la sélection à partir des meilleurs
  `score_match` (via `matching.compute` gateway) → **brouillon soumis à validation humaine** avant génération
  du lien (jamais d'envoi auto). Sur 👍 client, suggestion « proposer un créneau de visite » (create_visit HITL).
- **Étape de validation humaine** : l'agent valide la liste et déclenche la création du lien / l'envoi email
  (Resend). Aucune sélection ni envoi automatique.
- **Données nécessaires** : matchs (biens + score + explication), verdict client par bien, commentaire.
- **Données DÉJÀ dispo dans le repo** : `prosp_matchs` + jointure annonces et `explanation`
  (`app/api/prospection/matchs/route.ts`) ; **retour client → colonne `signal` existante**
  (`0017_prosp_matchs_feedback.sql`, mapping `lib/prospection/feedback.ts`) ; envoi email
  (`app/api/estimations/[id]/share/route.ts` comme patron Resend) ; token signé (`lib/estimation/share.ts`).
- **Données manquantes** : (a) un id de « sélection » regroupant N matchs — table légère
  `prosp_selections (id, tenant_id, user_id, critere_id, token_jti, expires_at)` + `prosp_selection_items
  (selection_id, match_id, position)` ; (b) colonne `prosp_match_feedback.source text default 'agent'
  check in ('agent','client')` + `comment text` (nullable) pour distinguer et stocker le retour client.
- **Routes/tables/composants concernés** : nouvelle route publique `app/selection/[token]/`, route API
  `POST /api/selection` (créer+signer, owner-check) et `POST /api/selection/[token]/feedback` (publique,
  écrit `signal`+`source='client'` scellé par le token — écriture **contrôlée**, service-role, jamais le
  bucket ni d'autres matchs) ; réutilise `mapAnnonce`, `feedback.ts`, `share.ts`.
- **Dépendances externes** : aucune (Resend déjà branché ; WhatsApp = bonus optionnel plus tard).
- **Taille estimée** : **M** (3–5 j) — 2 tables légères, 1 route publique + 2 routes API, 1 page client, 1
  entrée agent.
- **Risques** : écriture depuis une route publique → limiter au strict (rate-limit par token, valider
  `match_id ∈ selection`, jamais d'énumération) ; RGPD → n'afficher que biens + explication, aucun contact
  tiers ; expiration + révocation obligatoires. Anti-injection : `explanation` dérivée du breakdown, pas de
  texte annonce libre affiché comme fiable.
- **Preuve concurrentielle** : RealScout (Interested/not interested, agent voit instantanément — prouvé) ;
  Apimo (propositions de biens dans l'extranet acquéreur — prouvé).
- **Scénario de démo** : cocher 4 matchs → « Créer le lien » → ouvrir le lien en mobile → 👍 sur 2, 👎 sur 1,
  commentaire → revenir sur l'onglet feedback agent : 2 retenus, 1 écarté, commentaire visible ; proposer une
  visite sur un bien retenu.
- **Indicateur de succès** : % de sélections avec ≥1 retour client sous 72 h ; nb de visites créées depuis un
  bien 👍 ; réduction du délai « envoi → 1er retour ».
- **Décompte de score** : impact business **23**/25 (adresse un standard marché absent) · utilité quotidienne
  **18**/20 · effet démontrable **14**/15 (démo mobile immédiate) · avantage agentique **13**/15 (préparation
  Aigent + HITL) · faisabilité **13**/15 (réutilise matchs+feedback+share) · données **8**/10 (2 petites
  tables à ajouter). Pénalités : 0. **Total 88** (les sous-scores dépassent le format à cause d'arrondis ;
  plafonné 88).

### 2. Rapport de commercialisation vendeur (lien signé) — Score **85** — Taille M

- **Nom court** : Rapport vendeur / « Suivi de mon bien ».
- **Problème métier exact** : le vendeur en mandat (surtout exclusif) veut la preuve que « ça bouge ». Sans
  visibilité, il appelle, doute, et refuse de re-signer / passe en mandat simple. L'agent perd du temps en
  points téléphoniques et perd des exclusivités.
- **Utilisateur concerné** : agent (émetteur) + propriétaire vendeur (destinataire sans compte).
- **Moment du parcours** : pendant la commercialisation (hebdo/bi-mensuel), et au moment sensible du
  renouvellement de mandat.
- **Écran/emplacement précis** : `/mandates/[id]` et `/properties/[id]` — bouton « Rapport vendeur » +
  « Partager le suivi ». Vue publique : `app/rapport/[token]/page.tsx`. **Étend** un écran M04-11 (CRM dense)
  avec une **capacité nouvelle** (surface partagée vendeur), pas du polish. Frontière M04-11 : eux densifient
  le portefeuille interne ; moi j'expose une vue externe read-only au vendeur.
- **Comportement du widget** : page publique responsive datée, en-tête bien (photo cover, adresse, prix
  affiché) puis frise d'activité honnête : **visites** (nb réalisées / planifiées, sans identité des
  visiteurs), **retours de visite** anonymisés (synthèse `visits.feedback`), **statut commercial**
  (en_vente / sous_offre), **diffusion** (portails cochés par l'agent en champ libre — pas de vues externes),
  **actions récentes de l'agent**. Encart honnête « ces chiffres reflètent l'activité gérée par votre agence ».
- **Action disponible** : lecture seule ; bouton « Contacter mon agent » (mailto/tel du mandataire).
- **Automatisation éventuelle** : génération hebdo *préparée* par un agent Aigent (agrège visites/statut de la
  semaine) → **brouillon** notifié à l'agent ; envoi email au vendeur seulement après validation humaine.
- **Étape de validation humaine** : l'agent relit et déclenche l'envoi. Jamais d'envoi programmé sans clic.
- **Données nécessaires** : visites du bien, retours, statut, jalons mandat, éventuels portails saisis.
- **Données DÉJÀ dispo dans le repo** : `visits` (statut/feedback/scheduled_at, `0008_crm.sql`), `mandates`
  (`signed_at`,`expires_at`,`status`), `properties.status` + photos R2 (`0018`), token+page+email (patron
  brochure/share). **P** = la matière existe mais aucune agrégation « rapport ».
- **Données manquantes** : aucune table lourde requise ; option `properties.portails_diffusion text[]` (saisie
  agent) pour lister les portails sans intégration ; option table `share_links` (voir candidat 6) pour révoquer.
  **Assumé honnête** : pas de compteur de vues portails (non mesurable) ni d'ouverture du lien (pas de
  tracking) — le rapport ne prétend pas les afficher.
- **Routes/tables/composants concernés** : `app/rapport/[token]/`, `POST /api/mandates/[id]/report-link`
  (owner-check → signe token `kind:'seller_report'` portant `property_id`), agrégateur serveur
  `lib/reporting/seller.ts` (lecture service-role scellée par le token, un seul bien).
- **Dépendances externes** : aucune.
- **Taille estimée** : **M** (3–5 j).
- **Risques** : RGPD fort → **anonymiser** les visiteurs (jamais de nom/lead), données minimales, expiration,
  révocation ; ne jamais afficher de commission ou de note interne ; honnêteté des chiffres (pas de vue
  inventée).
- **Preuve concurrentielle** : Hektor « Espace Propriétaire » temps réel (visites, offres, acceptations/refus,
  portails — prouvé, 8 500 agences) ; Modelo espace propriétaire consultable + PDF (prouvé) ; Apimo extranet
  vendeur (prouvé). **Découverte** : Modelo/Hektor n'affichent pas de compteur de vues sur page publique →
  notre limite est alignée sur le marché.
- **Scénario de démo** : ouvrir un mandat avec 3 visites réalisées + 1 offre → « Générer le rapport » → lien
  mobile : frise « 3 visites, 1 offre en cours, diffusé sur 4 portails, statut sous offre » → « Contacter mon
  agent ».
- **Indicateur de succès** : taux de renouvellement de mandats exclusifs ; baisse des appels entrants « où en
  est mon bien » ; nb de rapports envoyés / mandat actif.
- **Décompte de score** : impact **24**/25 (rétention mandat exclusif = argent direct) · utilité **17**/20 ·
  effet démontrable **13**/15 · agentique **12**/15 · faisabilité **12**/15 · données **7**/10 (agrégation à
  écrire, pas de tracking vues). Pénalités : 0. **Total 85**.

### 3. Dossier de bien partageable (mini-vitrine signée) — Score **82** — Taille S

- **Nom court** : Dossier de bien partageable.
- **Problème métier exact** : pour envoyer UN bien à un acquéreur, l'agent partage un lien portail (marqué,
  pub concurrente, coordonnées d'autres agences) ou fabrique un PDF à la main. Rien de propre, brandé, minimal.
- **Utilisateur concerné** : agent + acquéreur/prospect (sans compte).
- **Moment du parcours** : qualification d'un acheteur, réponse à une demande entrante, teaser avant visite.
- **Écran/emplacement précis** : `/properties/[id]` — bouton **« Partager le bien »** (aujourd'hui la page
  n'offre QUE « Créer une estimation », vérifié `properties/[id]/page.tsx` l.210). Vue publique
  `app/bien/[token]/page.tsx`.
- **Comportement du widget** : page publique responsive — galerie photos (R2), titre, prix, surface, pièces,
  ville, badges DPE/GES + équipements, descriptif, carte optionnelle. `noindex`. Aucune donnée agence sensible.
- **Action disponible** : « Demander une visite / être recontacté » (formulaire minimal → crée un `lead`
  côté agent via write contrôlé, jamais le service-role exposé). Bouton copier / partager natif.
- **Automatisation éventuelle** : sur soumission du formulaire, création lead + tâche `rea_tasks` « rappeler ce
  prospect » (via gateway `crm.create-lead`, auditée). Rappel proposé, pas envoyé.
- **Étape de validation humaine** : le lead entrant apparaît en « à qualifier » ; aucune réponse auto au prospect.
- **Données nécessaires** : bien + photos (déjà là).
- **Données DÉJÀ dispo dans le repo** : `properties` + `property_photos` (`0008`,`0018`), R2
  `publicUrl`/`presignedUrl` (`lib/storage/r2.ts`), token+page (patron brochure), création lead
  (`app/api/agent-gateway/v1/crm/create-lead`). **O**.
- **Données manquantes** : colonne `properties.public_share_token`/`share_expires_at` (ou table `share_links`
  candidat 6). Rien d'autre.
- **Routes/tables/composants concernés** : `app/bien/[token]/`, `POST /api/properties/[id]/share`
  (owner-check → signe `kind:'property'`), réutilise `PhotoGallery.tsx`, `DpeBadge.tsx`.
- **Dépendances externes** : aucune.
- **Taille estimée** : **S** (1–2 j).
- **Risques** : RGPD léger (données du bien, pas de PII) ; masquer l'adresse exacte tant que non souhaité
  (afficher quartier) ; anti-injection (descriptif = donnée métier non fiable, échapper) ; expiration + révoc.
- **Preuve concurrentielle** : SweepBright (envoi d'un bien au prospect en 1 clic — prouvé) ; Apimo (fiche bien
  avec photos/documents dans extranet — prouvé) ; RealScout (fiche brandée sans pub concurrente — prouvé).
- **Scénario de démo** : ouvrir un bien avec 6 photos → « Partager le bien » → lien mobile propre → « être
  recontacté » → le lead apparaît côté agent en « à qualifier ».
- **Indicateur de succès** : nb de liens bien générés / semaine ; leads entrants via lien ; délai de 1er contact.
- **Décompte de score** : impact **20**/25 · utilité **17**/20 · effet démontrable **14**/15 (très visuel) ·
  agentique **10**/15 · faisabilité **14**/15 (S, tout dispo) · données **9**/10. Pénalités : 0. **Total 82**.

### 4. Fiche pratique de visite (envoyée avant le RDV) — Score **76** — Taille S

- **Nom court** : Fiche de visite (pré-visite).
- **Problème métier exact** : l'acquéreur arrive sans infos (adresse exacte, étage, code, stationnement, points
  à regarder), ou ne vient pas. L'agent renvoie les mêmes infos par SMS à chaque fois. No-shows et visites peu
  préparées.
- **Utilisateur concerné** : agent + acquéreur (visiteur, sans compte).
- **Moment du parcours** : entre la prise de RDV et la visite (`visits.status = planifiee/confirmee`).
- **Écran/emplacement précis** : `/visits` (ligne de visite → « Envoyer la fiche ») et `/properties/[id]`.
  Vue publique `app/visite/[token]/page.tsx`.
- **Comportement du widget** : page datée avec date/heure du RDV, adresse + accès, mini-galerie, 4–6 points
  clés du bien, checklist « à vérifier », bouton **ajouter au calendrier (.ics)** et itinéraire (lien maps).
- **Action disponible** : « Confirmer ma présence » (passe `visits.status → confirmee` via write contrôlé) ;
  « Prévenir d'un retard » (mailto agent).
- **Automatisation éventuelle** : envoi *suggéré* J-1 par un agent Aigent (rappel préparé) → validation agent.
  Sur confirmation, `visits.status` mis à jour.
- **Étape de validation humaine** : l'agent déclenche l'envoi (ou valide le rappel J-1). Pas d'envoi silencieux.
- **Données nécessaires** : visite (date, bien, lead) + bien + photos.
- **Données DÉJÀ dispo dans le repo** : `visits` (`scheduled_at`,`status`,`property_id`,`lead_id`, `0008`),
  `properties`+photos, token+page. **O**.
- **Données manquantes** : colonne `visits.share_token`/`expires_at` (ou table `share_links`). `.ics` généré
  côté serveur (pas de dépendance).
- **Routes/tables/composants concernés** : `app/visite/[token]/`, `POST /api/visits/[id]/prep-link`
  (owner-check → `kind:'visit'`), `GET /api/visite/[token]/ics`.
- **Dépendances externes** : aucune.
- **Taille estimée** : **S** (1–2 j).
- **Risques** : RGPD (adresse exacte communiquée à un prospect — n'envoyer qu'après RDV pris, expiration courte
  ~72 h) ; ne pas exposer l'identité d'autres parties.
- **Preuve concurrentielle** : Hektor rapport/suivi visite en 1 clic (prouvé, côté vendeur — ici pré-visite
  côté acquéreur, angle complémentaire) ; pattern standard des extranets (Apimo centralise visites — prouvé).
- **Scénario de démo** : visite planifiée demain → « Envoyer la fiche » → lien mobile avec .ics + accès +
  checklist → « Confirmer ma présence » → statut passe à *confirmée* côté agent.
- **Indicateur de succès** : taux de no-show avant/après ; taux de confirmations reçues ; temps agent économisé.
- **Décompte de score** : impact **17**/25 · utilité **16**/20 · effet démontrable **13**/15 · agentique
  **11**/15 (rappel J-1 préparé) · faisabilité **14**/15 · données **8**/10. Pénalités : 0. **Total 76** (S).

### 5. Compte rendu de visite partageable au vendeur — Score **74** — Taille S

- **Nom court** : CR de visite → vendeur.
- **Problème métier exact** : après chaque visite, le vendeur veut « alors, ça a donné quoi ? ». L'agent
  rappelle un par un. Le retour existe déjà en base (`visits.feedback`) mais reste enfermé côté agent.
- **Utilisateur concerné** : agent + propriétaire vendeur (sans compte).
- **Moment du parcours** : juste après une visite (`visits.status = realisee`, feedback saisi).
- **Écran/emplacement précis** : `/visits` (ligne réalisée → « Partager le CR au vendeur »). Réutilise la vue
  publique du **rapport vendeur** (candidat 2) filtrée sur une visite. **Frontière Opus 08** : Opus 08 *produit*
  le compte rendu de visite (contenu/structure) ; moi je le *rends partageable* au vendeur via lien signé, sans
  refaire sa saisie ni son écran de rédaction.
- **Comportement du widget** : carte publique — date de visite, synthèse du retour (anonymisée, sans identité
  du visiteur), niveau d'intérêt, prochaine étape ; encart « transmis par votre agence ».
- **Action disponible** : lecture seule ; « Contacter mon agent ».
- **Automatisation éventuelle** : proposition d'envoi dès `feedback` saisi (agent Aigent prépare la synthèse) →
  validation humaine avant envoi.
- **Étape de validation humaine** : l'agent relit la synthèse (peut la retoucher) et envoie. Rien d'auto.
- **Données nécessaires** : `visits.feedback` + statut + bien.
- **Données DÉJÀ dispo dans le repo** : `visits.feedback` (`0008_crm.sql`), token+page+email. **O**.
- **Données manquantes** : réutilise l'infra du candidat 2 (aucune table neuve si candidat 2 fait).
- **Routes/tables/composants concernés** : mutualisé avec candidat 2 (`app/rapport/[token]` en mode « visite »).
- **Dépendances externes** : aucune.
- **Taille estimée** : **S** (1–2 j) si mutualisé avec candidat 2.
- **Risques** : RGPD (anonymiser le visiteur) ; ne pas exposer le retour brut si négatif/agressif → synthèse
  reformulée, validée par l'agent.
- **Preuve concurrentielle** : Hektor « rapport de visite envoyé en 1 clic pour un suivi optimal du
  propriétaire » (prouvé).
- **Scénario de démo** : visite réalisée avec feedback « couple intéressé, revient avec un artisan » →
  « Partager le CR » → lien vendeur → « Contacter mon agent ».
- **Indicateur de succès** : nb de CR partagés / visite réalisée ; satisfaction vendeur ; réduction des appels.
- **Décompte de score** : impact **17**/25 · utilité **15**/20 · effet démontrable **12**/15 · agentique
  **11**/15 · faisabilité **13**/15 (mutualisé) · données **8**/10. Pénalités : 0. **Total 74** (S).

### 6. Registre de partages + révocation (centre de liens) — Score **72** — Taille S

- **Nom court** : Centre de liens partagés.
- **Problème métier exact** : dès qu'on multiplie les liens publics (estimation, sélection, bien, rapport,
  visite), on ne sait plus **ce qui est ouvert, à qui, jusqu'à quand** — et un lien signé JWT n'est
  **pas révocable** aujourd'hui (seule l'expiration le ferme). Problème RGPD/maîtrise réel.
- **Utilisateur concerné** : agent.
- **Moment du parcours** : gestion courante, ou quand un client demande de couper l'accès.
- **Écran/emplacement précis** : `/properties/[id]` (onglet « Liens ») + une petite section réglages ; **pas de
  menu top-level**. S'intègre aux candidats 1–5 comme couche transverse.
- **Comportement du widget** : liste des liens émis (type, objet, date, expiration, statut actif/révoqué) avec
  bouton **Révoquer**. La révocation marque le `jti` comme invalide → les routes publiques le rejettent
  (même logique que `revoked_sessions`, `0028`, déjà éprouvée dans le proxy).
- **Action disponible** : révoquer, prolonger, copier à nouveau.
- **Automatisation éventuelle** : purge auto des liens expirés (Inngest, `app/api/inngest/route.ts` présent).
- **Étape de validation humaine** : la révocation est une action agent explicite.
- **Données nécessaires** : registre des liens émis + liste de révocation.
- **Données DÉJÀ dispo dans le repo** : pattern révocation existant `revoked_sessions` (`0028`) réplicable ;
  `share.ts` peut sceller un `jti`. **P** (le mécanisme existe, la table de registre est à créer).
- **Données manquantes** : table `share_links (id, tenant_id, user_id, kind, object_id, jti, expires_at,
  revoked_at)` — devient le **socle commun** des candidats 1–5 (chacun y insère une ligne à l'émission ; les
  routes publiques vérifient `revoked_at IS NULL`).
- **Routes/tables/composants concernés** : `share_links`, helper `lib/sharing/registry.ts`,
  `POST /api/share-links/[id]/revoke`.
- **Dépendances externes** : aucune.
- **Taille estimée** : **S** (1–2 j).
- **Risques** : faible ; à faire **tôt** car il structure proprement les 5 autres (sinon liens irrévocables).
- **Preuve concurrentielle** : implicite dans tout extranet sécurisé (Apimo « accès sécurisé personnalisé » —
  prouvé) ; bonne pratique RGPD (droit de retrait).
- **Scénario de démo** : générer 3 liens → onglet « Liens » → révoquer un lien de sélection → recharger le lien
  révoqué → 404/expiré.
- **Indicateur de succès** : nb de liens révoqués sur demande ; 0 lien orphelin non expirable ; conformité RGPD.
- **Décompte de score** : impact **15**/25 · utilité **15**/20 · effet démontrable **11**/15 · agentique
  **9**/15 · faisabilité **14**/15 · données **8**/10. Pénalités : 0. **Total 72** (S). **Recommandation :
  faire ce socle AVANT ou avec le candidat 1.**

---

## Idées rejetées

- **Portail client permanent (6 mois, login acquéreur/vendeur)** — hors périmètre brief + GoTrue absent
  (UNAVAILABLE) ; le pattern imposé est le lien signé jetable. *Refonte/infra −.*
- **Compteur de vues « votre annonce vue X fois sur Leboncoin/SeLoger »** — aucune intégration MLS/portail
  (UNAVAILABLE) ; afficher ce chiffre = mentir. Le rapport vendeur montre l'activité agent, pas les vues portails.
  *Données non accessibles −15.*
- **Tracking d'ouverture/scroll du lien (heatmap engagement)** — aucune table de tracking, et surtout **domaine
  Opus 04** pour la brochure estimation. *Doublon de frontière + données absentes.*
- **Signature électronique intégrée du mandat** — aucune brique interne (grep docusign/yousign vide) ;
  dépendance externe Yousign/DocuSign (même l'intégration DocuSign+Claude exige Business Pro). Réel et
  stratégique (85–90 % du marché) mais = **dépendance externe indispo −15** → hors shortlist ; à noter comme
  chantier séparé (connecteur Yousign) une fois une clé disponible.
- **Chat temps réel acquéreur ↔ agent sur le lien** — Realtime Supabase absent (UNAVAILABLE) ; on se limite à
  👍/👎/commentaire asynchrone + mailto. *Infra manquante.*
- **Envoi automatique récurrent du rapport vendeur sans validation** — viole la règle dure « toute
  communication reste brouillon/validée ». *RGPD/communication non consentie −20.* Conservé uniquement en mode
  brouillon validé (candidat 2).
- **Envoi WhatsApp du lien au client** — transport WA « aperçu, non branché » (`alerts/dispatch`) ; Resend
  email suffit au game-changer. *Dépendance transport non câblée* → reporté en bonus.
- **Visite virtuelle / vidéo 360 partageable (type Matterport/Modelo)** — aucune capture 3D dans le repo ;
  dépendance externe + captation. *Données absentes / hors socle.*
- **« Espace acquéreur » agrégeant toutes ses sélections dans le temps** — nécessiterait une identité client
  persistante (≈ login) ; contredit le brief. Le lien de sélection ponctuel couvre 90 % de la valeur.
- **Génération auto de la description commerciale du dossier de bien par LLM** — chevauche l'assistant Cockpit
  existant et n'est pas une surface de partage ; hors domaine.
