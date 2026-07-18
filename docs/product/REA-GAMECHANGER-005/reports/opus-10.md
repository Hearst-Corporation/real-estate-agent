# REA-GAMECHANGER-005 — OPUS 10 · Confrontation marché / monétisation / défendabilité

> Mission différente des 9 autres : je ne propose PAS de nouveaux candidats. Je **confronte** les 54 candidats
> des 9 rapports au marché, à la monétisation (pricing observé chez les concurrents) et à la défendabilité,
> je **fusionne** les doublons, je **recalcule** les scores gonflés avec la grille du brief, et je rends au
> coordinateur **UN top 15 consolidé** décisionnable. J'ai lu les 9 rapports intégralement + le brief, et
> vérifié en recherche web (2026-07-18) les affirmations de pricing/positionnement qu'aucun Opus n'avait chiffrées.
>
> **Verdict d'ensemble en une ligne** : le conseil converge violemment sur 3 gisements (signal vendeur via
> `prosp_annonce_versions`, compte rendu de visite via `visits.feedback`, surfaces partagées signées via le
> pattern `share.ts`) — chacun proposé 3 à 4 fois sous des noms différents. La valeur game-changer n'est pas
> dans le nombre de candidats mais dans **3 briques socles qui débloquent tout le reste** : le **Centre
> d'approbation** (opus-06 C1, sans lui la moitié de l'agentique est morte), la **Boîte de sortie de
> brouillons** (opus-05 C1, le chaînon manquant entre « qui contacter » et « message parti »), et le
> **Registre de liens partagés** (opus-09 C6, socle des 6 surfaces publiques). Je les remonte en tête même
> quand leur score d'origine ne le faisait pas.

---

## Synthèse coordinateur

**TOP 15 CONSOLIDÉ** (rang · nom fusionné · opus source(s) · écran · taille · score consolidé /100 · effet business dominant · premium O/N · agentique O/N). Scores recalculés avec la grille du brief ; « → NN » indique un rescore vs l'origine.

| # | Nom fusionné | Opus source | Écran | Taille | Score | Effet dominant | Prem. | Agent. |
|---|--------------|-------------|-------|--------|-------|----------------|:---:|:---:|
| 1 | **Radar vendeur** (signal baisse/stagne/republie/retiré, scoré, → tâche accueil) | 02 C1+C3+C4 · 01 C6 · 06 C2 | `/prospection` onglet Radar + `/` | M | **90** | Conversion (rentrée de mandat) | **O** | **O** |
| 2 | **Off-market push** (matcher `properties` ↔ acquéreurs, propose à la signature) | 03 C1 | `/prospection` Matching + `/properties/[id]` | M | **89** | Conversion (vente inter-mandats) | **O** | **O** |
| 3 | **Centre d'approbation agent** (crée l'approbation qui débloque `alerts.dispatch`) | 06 C1 | `/agents` + `/` | M | **88** | Débloque TOUTE l'agentique | **O** | **O** |
| 4 | **Boîte de sortie de brouillons** (relance rédigée → brouillon Gmail 1 clic) | 05 C1 | `/` sous ActionCenter + `/leads/[id]` | M | **87** | Temps admin + conversion | **O** | **O** |
| 5 | **Débrief vocal de visite → CR** (voix→`visits.feedback`→brouillon vendeur) | 08 C1+C2 · 05 C4 · 01 C1 · 09 C5 | `/visits/[id]` (nouvelle fiche) | M | **86** | Rétention mandat + temps admin | **O** | **O** |
| 6 | **Sélection acquéreur partagée + 👍/👎** (lien signé, retour interactif) | 09 C1 | `/prospection` Matching + `/leads/[id]` | M | **84** | Conversion + temps admin | **O** | P |
| 7 | **Rapport de commercialisation vendeur** (espace propriétaire lien signé) | 09 C2 · 05 C6 | `/mandates/[id]` + `/properties/[id]` | M | **83** | Rétention mandat exclusif | **O** | P |
| 8 | **Radar d'ouverture de brochure** (tracking vue avis + « appelle maintenant ») | 04 C1+C6 | ValuationHero + `/` | M | **82** | Conversion estimation→mandat | **O** | P |
| 9 | **Score de priorité unifié** (next-best-action pondéré, remplace le tri à 3 paliers) | 01 C2 | `/` action center | S | **81** | Temps admin + utilité quotidienne | N | N |
| 10 | **Apprentissage des feedbacks** (👍/👎 repondèrent le matching) | 03 C3 | `/prospection` Matching + Feedback | M | **80** | Différenciation (boucle propriétaire) | **O** | P |
| 11 | **Câbler critères déclarés dans le moteur** (exclusions/urgence/secondaires) | 03 C5 | moteur `match.ts` | S | **79** | Différenciation (promesse tenue) | N | N |
| 12 | **Radar mandats à expiration** (fenêtre 30/15/7 j, parité Hektor) | 01 C3 | `/` + `/mandates` | XS | **78** | Rétention (zéro mandat perdu) | N | N |
| 13 | **Veille de valeur / relance datée** (dérive marché sur estimations dormantes) | 04 C2 | ContinuityPanel + `/estimations` | M | **77** | Conversion (le « Homebot » FR) | **O** | P |
| 14 | **Registre de liens partagés + révocation** (socle RGPD des surfaces publiques) | 09 C6 | `/properties/[id]` réglages | S | **76** | Conformité (habilitant) | N | N |
| 15 | **Carte de secteur prospection** (annonces géolocalisées, clic→contact) | 07 C1 | `/prospection` annonces/matching | S | **75** | Différenciation visuelle | N | N |

**Lecture pour le coordinateur** : les 5 premiers sont les vrais game-changers (impact business + agentique
+ premium simultanés). #3, #4, #14 sont des **habilitants** : leur score propre est « moyen » mais ils
débloquent respectivement l'agentique, la communication et les surfaces client — à cadencer EN PREMIER dans
le 48h/7j/21j, sinon 6 autres candidats livrent à moitié. Détail des fusions, du rescoring, du premium et de
la défendabilité ci-dessous.

---

## Doublons & fusions

**11 fusions recommandées.** Les 54 candidats des 9 rapports se réduisent à ~30 candidats distincts ; voici
les recouvrements réels (même donnée sous-jacente OU même écran OU même job métier) avec ma recommandation.

### F1 — Signal vendeur / baisse de prix → **« Radar vendeur »** (garder le nom d'opus-02)
**Recouvrement majeur, 5 candidats sur la MÊME table `prosp_annonce_versions` + `prix_precedent` + `scoreMandat`.**
- opus-02 C1 « Radar mandats » (flux scoré, onglet), C3 « Opportunités sur l'accueil » (tâches auto), C4 « retiré/republié ».
- opus-01 C6 « Réactivation sur baisse de prix ».
- opus-06 C2 « Agent Vigie nocturne » (même détection de delta, exécutée par un agent/cron).
- **Périmètre fusionné** : UN onglet « Radar » dans `/prospection` (liste scorée `scoreMandat` + badges signal :
  baisse / stagne / republié / retiré) + génération de `rea_tasks` sur l'accueil (la partie « agent nocturne »
  d'opus-06 devient le *déclencheur* du même radar, pas un produit séparé). opus-02 C4 (retiré/republié) est
  une **sous-fonctionnalité** du radar, pas un candidat.
- **Taille résultante** : M (l'onglet + le scoring + la génération de tâches ; l'exécution nocturne réutilise
  le cron Inngest existant). **Garder** : « Radar vendeur ». **Absorbe** : opus-01 C6, opus-02 C3/C4, opus-06 C2.

### F2 — Historique/trajectoire de prix d'une annonce → **fusionner dans le détail annonce**
- opus-02 C2 « Historique de prix par annonce » (timeline dans `AnnonceDetailDialog`) et opus-07 C2
  « Trajectoire de prix (sparkline) » sont **le même objet, le même écran, la même donnée**. opus-07 le
  reconnaît (« Complémentaire, non-dupliqué ») mais c'est un doublon franc.
- **Reco** : une seule section « Historique de prix » dans `AnnonceDetailDialog` (sparkline + Δ + badge vs DVF).
  **Garder** le rendu sparkline d'opus-07 + le Δ-vs-marché d'opus-02. Taille S. C'est un **compagnon du Radar
  (F1)**, à livrer avec lui, pas un item de top séparé (je le fonds dans #1).

### F3 — Compte rendu de visite → **« Débrief vocal de visite → CR »** (chaîne à 4 couches, 1 candidat)
**4 rapports découpent UN seul job métier (le CR de visite) en couches successives.** C'est le doublon le plus
subtil : chacun est « distinct » mais aucun ne vit seul.
- opus-08 C1 (capture VOCALE → texte) + C2 (fiche `/visits/[id]` + photos + statut) = **la matière + l'écran**.
- opus-05 C4 (4 champs → **brouillon email vendeur**) = **la sortie**.
- opus-01 C1 (**détection** de l'oubli `feedback IS NULL` → tâche accueil) = **le déclencheur**.
- opus-09 C5 (rendre le CR **partageable** au vendeur) = **la diffusion**.
- **Périmètre fusionné** : une fiche `/visits/[id]` (aujourd'hui inexistante) qui porte : détection d'oubli
  (opus-01), capture vocale + photos + statut (opus-08), génération du brouillon vendeur (opus-05 via la Boîte
  de sortie #4), et un partage optionnel (opus-09 via le Registre #14). **Garder** : opus-08 comme colonne
  vertébrale (il fournit la capture, la brique la plus différenciante). Les 3 autres sont des **greffes** sur la
  même fiche. Taille M pour la fiche + capture ; les greffes sont XS-S chacune une fois la fiche là.
- **Attention** : ne PAS traiter opus-01 C1, opus-05 C4, opus-08 C1/C2, opus-09 C5 comme **5 items de roadmap
  séparés** — c'est UN chantier « fiche visite » livré en tranches. Compté une fois (#5).

### F4 — Réactivation des dormants → **fusionner sous la Boîte de sortie**
- opus-01 C5 « Fraîcheur du portefeuille » (score de refroidissement), opus-03 C4 « Réveil des dormants sur
  nouveauté », opus-05 C3 « Réactivation froide à prétexte réel ».
- **Recouvrement** : les 3 détectent des leads froids et poussent une relance. opus-03 C4 se distingue par le
  déclencheur (nouveauté ≥ seuil, pas l'inactivité) ; opus-05 C3 par le prétexte factuel (baisse/nouveau
  match/anniversaire) ; opus-01 C5 par la vue agrégée « température ».
- **Reco** : **une** capacité « Réactivation à prétexte réel » (garder opus-05 C3, la plus complète : elle
  englobe le déclencheur-nouveauté d'opus-03 C4 et se branche sur la Boîte de sortie #4 pour le brouillon).
  opus-01 C5 (tuile « qui refroidit ») devient une **vue** secondaire, pas un item de top. Je ne mets AUCUN des
  trois dans le top 15 en tant que tel : la valeur est réelle mais **entièrement dépendante de la Boîte de
  sortie (#4)** — c'est un mode d'emploi de #4, pas un candidat autonome. (Éliminé du top, voir §Alertes.)

### F5 — Timeline unifiée lead/bien → **1 candidat, cédé par opus-07**
- opus-01 C8 et opus-05 C2 sont **identiques** (union multi-tables sur la fiche `/leads/[id]` + `/properties/[id]`).
  opus-07 l'avait aussi et l'a explicitement cédé (« déjà proposé par Opus 01 (C8). Rejeté »).
- **Reco** : garder **une** timeline (opus-05 C2, décompte le plus honnête). Mais je la **sors du top 15** :
  score réel 74-76, agentique quasi nulle (vue de lecture), et surtout elle **recoupe M04-11** (CRM/portefeuille
  dense) de très près — le brief pénalise la densité déguisée. Utile, mais rang 16-18, pas game-changer. (Voir §Alertes.)

### F6 — Espace / rapport propriétaire → **« Rapport de commercialisation vendeur »**
- opus-05 C6 « Espace propriétaire / rapport de mandat » et opus-09 C2 « Rapport de commercialisation vendeur »
  sont **le même produit** (page publique signée `/rapport/[token]` montrant visites/offres/statut au vendeur).
- **Reco** : garder opus-09 C2 (analyse RGPD + honnêteté « pas de vues portails » plus fine). opus-05 C6 est
  absorbé. Taille M. C'est #7 du top.

### F7 — Entonnoir de conversion → **1 candidat, angle à trancher**
- opus-04 C3 « Pipeline de conversion estimation→mandat » (funnel spécifique estimation, dans `/estimations`)
  et opus-07 C7 « Entonnoir transverse » (5 étages cross-module, sur l'accueil) se recoupent. opus-07 le
  signale (« Si recouvrement jugé trop fort, fusionner sous Opus 04 »).
- **Reco** : garder **opus-04 C3** (funnel estimation→mandat, cohorte plus honnête via `decision`) ; opus-07 C7
  (funnel transverse) est **rejeté** — son propre auteur admet que la cohorte est « imparfaite » (volumes ≠
  cohorte), il recoupe M04-08 (accueil), et un funnel de volumes non-chaînés est un **KPI décoratif déguisé**
  (le brief élimine les KPI sans action fiable). Ni l'un ni l'autre n'entre dans mon top 15 (voir §Alertes :
  opus-04 C3 est bon mais pilotage, pas quotidien).

### F8 — Estimation « à relancer » remontée au cockpit → **fusionner dans la Veille de valeur**
- opus-01 C4 « Estimations sans suite → relance » (remonte `decision='a_relancer'` à l'accueil) et opus-04 C2
  « Veille de valeur » (dérive marché sur estimations dormantes) travaillent la MÊME cible (estimation vendeur
  non convertie) au même moment (nurturing propriétaire).
- **Reco** : garder opus-04 C2 (« Veille de valeur ») qui **englobe** opus-01 C4 : la veille remonte de toute
  façon les `a_relancer` à l'accueil, en y ajoutant le prétexte chiffré (« +2,1 % depuis mars »). opus-01 C4
  seul = la version pauvre de la même chose. **Absorbé.** C'est #13.

### F9 — Positionnement prix vs marché → **fusionner les deux angles**
- opus-02 C6 « Écart prix demandé ↔ estimation » (badge surcoté/sous-évalué sur la liste annonces, côté
  acquisition vendeur) et opus-07 C5 « Matrice de positionnement prix du portefeuille » (biens du portefeuille
  vs médiane, côté gestion) partagent le calcul (Δ prix vs médiane DVF) mais sur des objets différents (annonces
  externes vs portefeuille interne).
- **Reco** : **un seul util de calcul** `priceVsMarket()` réutilisé aux deux endroits ; ce sont deux
  *emplacements* d'une même capacité, pas deux features. Aucun des deux n'entre au top 15 (scores 72/76,
  faisabilité conditionnée au coût d'estimation à la volée pour opus-02 C6, et au lien estimation↔bien 0039
  pour opus-07 C5). Compagnons du Radar (#1) et de la Veille (#13).

### F10 — Assistant / tools signaux vendeur → **fusionner dans le Radar**
- opus-02 C7 « Assistant : outils signaux vendeur » (2 tools chat `list_mandate_opportunities` +
  `prepare_seller_contact`) est la **surface chat** du Radar (#1). Son propre décompte note « dépend de C1 pour
  la valeur ». **Reco** : livrer ces 2 tools EN MÊME TEMPS que le Radar (c'est le canal agentique du même
  gisement), pas comme candidat séparé. Absorbé dans #1.

### F11 — Alerte baisse → acquéreur → **fusionner dans Off-market + Radar**
- opus-03 C2 « Alerte baisse de prix → acquéreurs » recroise opus-01 C6/opus-02 (la baisse) ET l'off-market
  (opus-03 C1) : une annonce qui baisse et qui matchait un acquéreur = signal chaud à pousser. **Reco** : c'est
  l'intersection du Radar (#1, détection de baisse) et de l'Off-market (#2, matcher des acquéreurs) — la
  fonctionnalité émerge gratuitement quand #1 et #2 existent. Ne pas compter séparément.

### Doublons NON fusionnés (distincts, chacun garde sa place)
- **Carte de secteur** (opus-07 C1) vs **Carte portefeuille** (opus-07 C4) : deux écrans, deux jeux de données
  (annonces géolocalisées O vs `properties` à géocoder P). C1 reste (#15) ; C4 sort (géocodage à câbler, données P).
- **Nuage de comparables DVF** (opus-07 C3) : unique, aucun autre ne le propose. Bon score (82) mais je le
  laisse hors top 15 (argument de présentation vendeur, pas de conversion mesurable ni d'agentique) — rang 16.
- **Score de match expliqué en barres** (opus-07 C6) : polish visuel d'un existant (`score_breakdown` déjà
  affiché), XS, agentique nulle. Hors top.

---

## Analyse business / premium / défendabilité

### 3.1 Grille de lecture business (par candidat du top 15)

| # | Candidat | ↑ Conversion | ↓ Temps admin | ↑ Rétention | Différencie vs FR/US | Exploite Aigent+gateway |
|---|----------|:---:|:---:|:---:|---|:---:|
| 1 | Radar vendeur | **+++** | + | ++ | Parité Casafari/MoteurImmo, MAIS 1er FR à **automatiser** l'alerte (MoteurImmo n'alerte pas) | **+++** (agent nocturne + gateway) |
| 2 | Off-market push | **+++** | + | + | matchimo/WinImmobilier le vendent ; rare hors FR | **++** (matching.compute + prepare) |
| 3 | Centre d'approbation | + | + | + | Rechat/Lofty « feu vert humain » = standard US 2026 ; **absent partout en FR** | **+++** (LE flux HITL) |
| 4 | Boîte de sortie brouillons | ++ | **+++** | ++ | FUB/kvCORE « IA rédige, humain valide » ; Azigo = sortir du chat en file 1-clic | **++** (Composio Gmail draft) |
| 5 | Débrief vocal CR | + | **+++** | **+++** | Rechat AI Memo (avr. 2026) ; SweepBright/Hektor Voice | **++** (structuration LLM) |
| 6 | Sélection acquéreur partagée | ++ | ++ | + | RealScout (US) le fait ; **rien d'équivalent côté FR grand public** | ++ (préparation Aigent) |
| 7 | Rapport vendeur | + | ++ | **+++** | Hektor/Modelo/Apimo = **standard FR** (Alur law) ; Azigo n'a RIEN | ++ (agrégation préparée) |
| 8 | Radar ouverture brochure | **+++** | + | + | Cloud CMA/PriceHubble (US/EU) ; **absent FR** | + (relance brouillon) |
| 9 | Score priorité unifié | + | **++** | + | FUB = listes manuelles ; Azigo **génère** l'ordre | – |
| 10 | Apprentissage feedbacks | + | + | + | kvCORE behavioral ; **boucle propriétaire** = défendable | + |
| 11 | Câbler critères déclarés | + | + | + | « tenir la promesse déjà affichée » (rattrapage interne) | – |
| 12 | Radar expiration mandats | + | + | **+++** | **Feature phare Hektor** (8 500 agences) — parité attendue | – |
| 13 | Veille de valeur | **+++** | + | ++ | Homebot (75 % ouverture, 3-5 leads/100/mois) ; **absent FR natif** | ++ (job mensuel préparé) |
| 14 | Registre de liens | – | + | – | Habilitant RGPD (droit de retrait) ; implicite chez tout extranet | – |
| 15 | Carte de secteur | + | + | – | Yanport/kvCORE heatmaps ; parité visuelle | – |

### 3.2 Potentiel PREMIUM — ce que le pricing concurrent enseigne (recherche 2026-07-18)

**Pratiques de pricing observées (vérifiées en web) :**
- **Follow Up Boss** : 3 paliers — Grow **69 $/user/mois**, Pro **499 $/mois** (10 users), Platform **1000 $/mois**
  (30 users). L'IA n'est **pas** un add-on tarifé séparément, mais elle **dépend de FUB Calling** (add-on payant
  du plan Grow) et les capacités avancées sont **gatées par palier/sièges**. Leçon : chez le leader US, l'IA se
  monétise par le **palier**, pas à la carte.
- **Hektor / La Boîte Immo** : **modulaire, 70-150 €/mois**, « vous ne payez que les modules dont vous avez
  besoin ». L'**Espace Propriétaire** est mis en avant comme différenciateur (et rattaché à l'obligation **loi
  Alur** sur le mandat exclusif). Leçon FR : les fonctions se vendent **au module** — un module « Suivi vendeur »
  ou « Prospection intelligente » est le format de facturation naturel du marché français.
- **Netty/Modelo** : ~49-89 €/user/mois, prix désormais **sur devis** (page tarifs retirée juin 2026).
- **Rechat AI Memo** (le CR vocal) : **inclus sans surcoût** dans toutes les offres. Leçon **importante** : le CR
  vocal SEUL est déjà **table-stakes**, pas un premium — il ne se facture que **combiné** (capture → CR → brouillon
  vendeur → suivi).
- **Casafari/MoteurImmo** : le radar de signaux vendeur (baisse/FSBO/days-on-market/sortie) est **le cœur de leur
  offre payante** (Casafari : abonnement annuel, prix sur demande, 200 alertes/compte).

**Classement premium (ce qui justifie un palier « Azigo Pro » ou un module payant) :**

1. **Radar vendeur (#1)** — **le plus fort potentiel premium.** C'est exactement ce que Casafari et MoteurImmo
   **font payer cher** comme produit à part entière. Azigo le construit sur des données qu'il **collecte déjà**
   (coût marginal ≈ lecture/tri) et peut le vendre comme **module « Prospection intelligente »** à la Hektor. Le
   fait que MoteurImmo **n'automatise pas** l'alerte (affichage manuel seul) ouvre un cran de différenciation
   premium net : « le seul radar vendeur FR qui vous prépare la journée pendant la nuit ».
2. **Centre d'approbation + agents nocturnes (#3 + agentique)** — palier « Pro agentique » : l'autonomie
   surveillée (prepare→approve→dispatch) est ce que Rechat/Lofty vendent comme haut de gamme aux US. Gate naturelle.
3. **Rapport vendeur / Espace propriétaire (#7)** — module premium **attendu par le marché FR** (Hektor le met en
   avant, loi Alur le rend quasi-obligatoire sur l'exclusif). Facturable au module.
4. **Radar d'ouverture de brochure + Veille de valeur (#8 + #13)** — le « Homebot/Cloud CMA » à la française :
   entretien de valeur + tracking d'engagement = brique de rétention/conversion que les acteurs US **facturent**
   (Homebot est un produit vendu séparément aux agents).
5. **Débrief vocal (#5)** — premium **uniquement en chaîne** (voix→CR→brouillon→partage), jamais seul (leçon Rechat).

**NON premium (table-stakes ou habilitants, à mettre dans le socle) :** #9 score de priorité, #11 câblage
critères, #12 radar expiration (parité attendue, pas un différenciateur payant), #14 registre de liens
(habilitant RGPD), #15 carte (parité visuelle). Ce sont des raisons de **rester**, pas de **payer plus**.

### 3.3 Avantage DÉFENDABLE (difficilement copiable) vs cosmétique

Le brief demande de distinguer ce qui accumule un moat (données propriétaires, boucle de feedback, intégration
agentique) de ce qui est rattrapable en un sprint par un concurrent.

**Défendable — moat réel :**
- **#10 Apprentissage des feedbacks** — **le plus défendable.** Chaque 👍/👎 accumulé re-pondère le matching *par
  tenant* : plus l'agent l'utilise, plus le moteur colle à SON marché, et cette donnée comportementale
  propriétaire **ne se copie pas** (un concurrent repart de zéro). C'est la seule vraie boucle de feedback
  auto-renforçante du lot. Sous-estimé par opus-03 (82) au regard de sa défendabilité.
- **#6 Sélection acquéreur + #1/#13 accumulation d'historique** — les retours client (`signal='client'`) et
  l'historique de prix accumulé (`prosp_annonce_versions` qui grossit à chaque cycle d'ingestion) sont des
  **données propriétaires qui s'épaississent avec le temps** : un nouvel entrant n'a pas 18 mois de versions de
  prix ni le corpus de préférences révélées. Moat temporel réel.
- **#3 + #4 + agents nocturnes — l'intégration agentique** : la gateway durcie (15 routes, HITL, audit,
  idempotence, approbations) est un **actif d'ingénierie déjà payé** que peu de concurrents FR ont. Le Centre
  d'approbation transforme cet actif en produit. Difficilement rattrapable en un sprint (c'est un semestre d'infra).
- **#5 Débrief vocal + `visits.feedback`** : moat modéré — la capture est copiable (Rechat l'a, gratuite), mais
  le **corpus de CR structurés accumulé** alimente à terme la boucle de feedback et le contexte agent. Défendable
  par la donnée accumulée, pas par la feature.

**Cosmétique / rattrapable en un sprint (utile mais zéro moat) :**
- **#9 score de priorité**, **#12 radar expiration**, **#15 carte de secteur**, opus-07 C3/C6 (scatter, barres) :
  ce sont des **recompositions de données existantes** sans accumulation. Un concurrent les copie en jours. Ils
  gagnent la démo, pas la guerre. À garder (ils ferment des gaps perçus) mais sans illusion de défendabilité.
- **#8 tracking ouverture brochure** : la table `estimation_share_events` accumule un signal propriétaire (moat
  faible mais réel) ; le mécanisme lui-même est trivial à copier.
- **#14 registre de liens** : pure hygiène, zéro moat (mais nécessaire).

**Synthèse défendabilité** : le moat d'Azigo n'est PAS dans une feature isolée — c'est dans **la combinaison
(données propriétaires qui s'accumulent : historique de prix + feedbacks + CR + engagement) × (intégration
agentique déjà construite)**. Le coordinateur devrait prioriser les candidats qui **remplissent ces réservoirs**
(#1, #6, #10, #13, #5) au-dessus de ceux qui font seulement joli (#15, scatter, barres).

---

## Preuves concurrentielles complémentaires

Vérifications web (2026-07-18) sur les affirmations de pricing/positionnement qu'aucun des 9 Opus n'avait
chiffrées — nécessaires pour l'analyse premium ci-dessus. PROUVÉ = lu sur la page/snippet ; INFÉRÉ = recoupé.

| Sujet | Constat vérifié | Source | Prouvé/Inféré |
|-------|-----------------|--------|---------------|
| **FUB pricing 3 paliers** | Grow 69 $/user, Pro 499 $/mois (10 u.), Platform 1000 $/mois (30 u.) ; IA incluse mais dépend de FUB Calling (add-on payant) | followupboss.com/pricing ; cloudtalk.io/blog/follow-up-boss-pricing | **Prouvé** (snippets concordants) |
| **Hektor pricing modulaire** | 70-150 €/mois, « ne payez que les modules utilisés », prix sur devis, apps mobiles incluses | ia-lab-immo.com/blog/hektor-crm-immobilier-prix-avis-guide ; diffuze.fr | **Prouvé** |
| **Hektor Espace Propriétaire ↔ loi Alur** | Espace propriétaire « requis par la loi Alur dans les mandats exclusifs » ; suivi temps réel des actions du mandat | la-boite-immo.com/actualites/lespace-proprietaire-sur-hektor… | **Prouvé** (rattachement réglementaire = argument premium FR fort) |
| **Rechat AI Memo inclus** | CR vocal « available to all customers at no additional cost, nothing new to learn » | housingwire.com/articles/rechat-launches-ai-memo-tool ; rismedia 2026-04-08 | **Prouvé** → **le CR vocal seul = table-stakes, pas premium** |
| **Netty/Modelo pricing** | ~49-89 €/user/mois, page tarifs retirée (juin 2026), sur devis ; groupe Septeo | diffuze.fr/blog/netty-avis-tarifs ; getapp.com | **Prouvé** (tiers) |
| **Casafari monétisation** | Radar alertes (entrées/sorties/baisses/FSBO) = cœur d'offre payante, abo annuel, prix sur demande, CRM gratuit en entrée | casafari.com/faq ; /products/solutions-for-agents | **Prouvé** (modèle) / prix exact **non public** |
| **Lofty Homeowner Agent** | « fully autonomous pipeline builder qui travaille la base 24/7 pour gagner des mandats vendeurs » ; prix add-on **non divulgué** | realestatenews.com 2026-04-09 | **Prouvé** (positionnement) / prix Inféré indispo |

**Deux corrections que ces preuves imposent aux rapports d'origine :**
1. **opus-08 surestime la nouveauté du CR vocal** : Rechat le donne **gratuitement** depuis avril 2026, SweepBright
   et Hektor Voice l'ont. Le CR vocal n'est PAS un game-changer différenciant *en soi* — il l'est seulement
   **chaîné** au brouillon vendeur (opus-05) et au suivi. J'ai donc scoré #5 à 86 (fort, mais pas « premier sur
   le marché »), pas au-dessus.
2. **opus-02/06 ont raison sur un point clé et sous-vendu** : MoteurImmo **stocke** l'historique mais **n'alerte
   pas** (confirmé). Le Radar vendeur d'Azigo qui *automatise* l'alerte (agent nocturne) est donc un
   différenciateur **réel et vérifié** face au leader FR de la pige — ce qui justifie de le classer #1.

---

## Alertes de taille / faisabilité

Candidats dont la taille annoncée me paraît **sous-estimée** (dépendances cachées, migration, HITL/déploiement
à construire), et candidats **≥70 que j'élimine du top** malgré leur score.

### 4.1 Tailles sous-estimées (à requalifier pour le 48h/7j/21j)

- **#3 Centre d'approbation (opus-06 C1, annoncé M)** — **dépendance dure cachée** : la migration **0045
  (`agent_alert_approvals`) n'est PAS déployée sur gpu1** aujourd'hui (opus-06 le dit : « tout est DENIED »). La
  fiche UI est M, mais le **préalable de déploiement DB + vérification bout-en-bout du dispatch réel (Resend)** est
  à cadrer AVANT. Réel : **M plein, à démarrer en premier**. Sans ça, #1 (agent nocturne), #2, #4, #6, #7 qui
  s'appuient sur la préparation/approbation livrent à moitié.
- **#4 Boîte de sortie (opus-05 C1, annoncé M)** — dépend de **Composio Gmail connecté par tenant** (statut de
  connexion variable) + **1 table `rea_comm_drafts`** + câblage de l'ActionCenter (qui aujourd'hui crée une tâche
  VIDE). opus-05 est honnête (M) mais c'est un **M haut** : c'est le socle de #5 (brouillon vendeur), F4
  (réactivation) et opus-05 C5 (cadences). À traiter comme **habilitant**, pas comme une feature parmi d'autres.
- **#5 Débrief vocal (opus-08 C1, annoncé M)** — la **fiche `/visits/[id]` n'existe pas** (à créer entièrement),
  la Web Speech API est navigateur-dépendante (Firefox faible → fallback obligatoire), et la variante Whisper
  serveur ajoute upload R2 + route + **cost-guard**. Le M tient pour la V1 vocale-navigateur, mais **F3 (les 4
  couches) est un chantier L cumulé** si on veut capture + photos + brouillon + partage. Le coordinateur doit
  **découper F3 en tranches**, pas le vendre comme « un M ».
- **#6 Sélection acquéreur (opus-09 C1, annoncé M)** — **2 tables** (`prosp_selections` + `prosp_selection_items`)
  + colonne `source`/`comment` sur `prosp_match_feedback` + **route publique en ÉCRITURE** (feedback client
  depuis une page sans session) = surface d'attaque nouvelle exigeant rate-limit par token, validation
  `match_id ∈ selection`, anti-énumération. La sécurité de la route publique écrivante est **le vrai coût**, pas
  l'UI. M **serré** ; dépend idéalement du Registre de liens (#14) pour la révocation.
- **#7 Rapport vendeur (opus-09 C2, annoncé M, données P)** — l'**agrégation « rapport » n'existe pas**
  (`lib/reporting/seller.ts` à écrire), l'**anonymisation des visiteurs** est un point RGPD dur (jamais de nom de
  lead), et la page publique doit être scellée par token. M correct **mais data P** (pas O) : ne pas le présenter
  « données prêtes ».
- **#8 Radar ouverture brochure (opus-04 C1, données P)** — **1 table `estimation_share_events`** + insert
  fire-and-forget dans la route PDF + gestion des faux positifs (pré-chargement de lien mail). opus-04 est
  honnête (P), mais le **filtrage des vues-fantômes** (aperçu messagerie) est un vrai réglage produit, pas trivial.
- **#13 Veille de valeur (opus-04 C2)** — **risque de sur-promesse** : l'index national `NATIONAL_INDEX` est une
  **approximation** ; présenter « votre bien vaut +2,1 % » sans le cadrer « indicatif national » est un risque de
  crédibilité (et opus-04 se pénalise justement −6 là-dessus). Faisable en M, mais **l'honnêteté d'affichage est
  une contrainte de conception**, pas une option.
- **#2 Off-market (opus-03 C1)** — l'adaptateur `property → Annonce` est « trivial » selon opus-03, mais le
  **matching cron ne touche JAMAIS `properties`** aujourd'hui (gap #3 vérifié) : il faut étendre `functions.ts` +
  `matching.compute` + gérer la **confusion UI biens internes/externes**. M réaliste, pas S.

### 4.2 Candidats ≥70 que J'ÉLIMINE du top 15 (avec raison)

- **opus-04 C3 « Pipeline de conversion estimation→mandat » (82)** — **éliminé du top** : excellent outil mais
  **pilotage** (usage hebdo/mensuel, pas quotidien), et il **recoupe l'esprit de M04-08** (vue accueil) + le
  funnel. Rang 16. Garder l'idée, pas dans les 15 game-changers du terrain quotidien.
- **opus-07 C7 « Entonnoir transverse » (72)** — **éliminé** : cohorte « imparfaite » de l'aveu de l'auteur
  (volumes ≠ suivi de cohorte réel), recoupe M04-08, et un funnel de volumes non-chaînés est un **KPI décoratif**
  que le brief élimine. Fusionné/mort sous opus-04 C3 (F7).
- **opus-01 C5 / opus-03 C4 / opus-05 C3 (réactivation, 80/80/83)** — **éliminés en tant qu'items autonomes** :
  fusionnés (F4). La valeur est réelle mais **100 % dépendante de la Boîte de sortie (#4)** pour le brouillon —
  ce sont des **modes d'emploi de #4**, pas 3 candidats. À livrer comme extension de #4 une fois #4 en place.
- **Timeline unifiée (opus-01 C8 / opus-05 C2, 74/85)** — **éliminée du top** : score gonflé côté opus-05 (85 pour
  une **vue de lecture sans agentique**), et surtout **recoupe M04-11** (CRM dense) de trop près — le brief
  pénalise la densité déguisée en capacité. Vraie utilité (rang 16-18), zéro moat, pas game-changer.
- **opus-07 C3 « Nuage de comparables DVF » (82)** — **éliminé du top** : bel argument de présentation vendeur,
  mais **zéro conversion mesurable, zéro agentique, zéro accumulation** (recompose des comparables déjà chargés).
  Rang 16. Cosmétique premium (démo), pas moat.
- **opus-04 C5 « Boucle prix conseillé ↔ réalisé » (74)** — **éliminé du top** : dépend d'une **saisie manuelle**
  du prix de vente (friction réelle, adoption incertaine) + colonne `sold_price` à ajouter, et l'effet portefeuille
  est **maigre au démarrage** (peu de biens `vendu`). Bonne idée de crédibilité long-terme, pas un game-changer
  démontrable à 21 j.
- **opus-06 C4/C5/C6 (qualificateur ISA / lancer agent depuis fiche / cron produit, 78/74/72)** — **éliminés du
  top** : tous **dépendent d'Aigent réellement raccordé avec ≥1 agent publié** (registre **vide** aujourd'hui).
  Tant que le registre est vide, ces 3 candidats ont une **valeur nulle en démo** (opus-06 le reconnaît). À
  débloquer APRÈS que le Centre d'approbation (#3) + un premier agent (le Radar nocturne #1) existent. Prématurés.

### 4.3 Recommandation de séquencement au coordinateur (habilitants d'abord)

Le piège du 48h/7j/21j serait de livrer les 5 top-scores et de découvrir qu'ils sont à moitié câblés. Ordre sûr :

1. **Socle (à faire EN PREMIER, sinon 6 candidats livrent à moitié)** : déployer **migration 0045** + **Centre
   d'approbation (#3)** ; **Boîte de sortie + `rea_comm_drafts` (#4)** ; **Registre de liens `share_links` (#14)**.
2. **Gisements à fort ROI immédiat** (données déjà là, coût marginal faible) : **Radar vendeur (#1)** + son
   compagnon historique de prix (F2) + les 2 tools chat (F10) ; **Score de priorité (#9)** ; **Radar expiration
   (#12)** ; **Câbler critères déclarés (#11)** — ces 4 derniers sont XS/S et ferment des gaps perçus vite.
3. **Différenciateurs premium** (une fois le socle là) : **Off-market (#2)**, **Débrief vocal (#5)** en tranches,
   **Sélection acquéreur (#6)**, **Rapport vendeur (#7)**, **Radar ouverture brochure (#8)**, **Veille de valeur
   (#13)**, **Apprentissage feedbacks (#10)**.
4. **Agentique avancée** (nécessite Aigent raccordé) : agents nocturnes pilotant #1, puis opus-06 C4/C5/C6.

---

### Note d'honnêteté
Je n'ai PAS re-vérifié le code du worktree (les 9 rapports l'ont fait, chemins cités ; je m'appuie sur leurs
constats croisés). Mon apport est la **confrontation marché + fusion + rescoring**, pas une nouvelle lecture du
repo. Les rescores sont des **jugements** appliquant la grille du brief (notamment : pénaliser la densité
déguisée façon M04, dévaloriser les vues de lecture sans agentique/moat, revaloriser les briques habilitantes et
les boucles de feedback défendables) — un autre évaluateur pourrait bouger un candidat de ±3-5 points. Les
preuves de pricing sont web-vérifiées (2026-07-18) ; les prix exacts de Casafari/Lofty add-on restent **non
publics** (dit honnêtement). Aucune donnée/intégration n'est présentée comme disponible à tort : je reprends les
statuts AVAILABLE/CONFIG/UNAVAILABLE établis par les 9 rapports et le brief.
