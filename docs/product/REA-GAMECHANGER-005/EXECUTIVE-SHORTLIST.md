# EXECUTIVE SHORTLIST — REA-GAMECHANGER-005

> Conseil produit de 10 Opus · 2026-07-18 · Base analysée : `feature/rea-platform-003@b2d8540`
> (= `orchestration/REA-MASTER-20260718-01@4084f72`). 59 candidats ≥70 produits par les Opus 01-09,
> 11 fusions et rescoring par l'Opus 10 (benchmark/monétisation), arbitrage final coordinateur.
> Détail par candidat : `reports/opus-01.md` → `opus-10.md`. Rejets : `REJECTED-IDEAS.md`.

## Le verdict en 3 lignes

Le conseil converge violemment sur un fait : **les données game-changer sont DÉJÀ en base mais muettes**
(`prosp_annonce_versions` + `scoreMandat` jamais lus, `visits.feedback` sans UI, lat/lng jamais SELECT,
👍/👎 jamais réinjectés, gateway HITL sans flux humain). La priorité n'est pas d'inventer : c'est de
**brancher 3 habilitants** (Centre d'approbation, Boîte de sortie, Registre de liens) puis de **surfacer
les gisements dormants** — ce qui rend la plateforme visiblement plus intelligente en jours, pas en mois.

## Shortlist finale (15)

| Rang | Ajout | Écran | Taille | Score | Données prêtes | Effet business | Effet démonstration |
|---|---|---|---|---|---|---|---|
| 1 | **Radar vendeur** — signaux baisse/stagnation/republication/retiré/PAP scorés (`scoreMandat`), historique de prix sparkline dans le détail annonce, tâches auto sur l'accueil, 2 tools chat (fusion 02·C1+C3+C4, 01·C6, 06·C2, 07·C2) | `/prospection` onglet « Radar » + `/` action center + `AnnonceDetailDialog` | M | **90** | **O** (tables 0040 écrites, jamais lues) | Rentrée de mandats : contacter le vendeur au moment où il devient preneur ; 1er FR à AUTOMATISER l'alerte (MoteurImmo stocke sans alerter, Casafari le vend cher) | « Pendant la nuit, Azigo a repéré 7 vendeurs probables — voici pourquoi, et le brouillon de contact est prêt » |
| 2 | **Off-market push** — à chaque mandat signé, matcher `properties` ↔ tous les acquéreurs compatibles (03·C1) | `/prospection` Matching + carte sur `/properties/[id]` | M | **89** | **O** | Vente inter-mandats sans portail (la promesse n°1 de matchimo.fr : « mandat signé à 19h → acquéreurs alertés à 7h ») | Signer un mandat en démo → la liste des acquéreurs compatibles apparaît instantanément |
| 3 | **Centre d'approbation agent** — flux humain create→approve qui débloque `alerts.dispatch` (aujourd'hui DENIED), + journal d'activité gateway (fusion 06·C1+C3) | `/agents` (onglets Approbations + Journal) + widget `/` | M | **88** | **P** (migration 0045 à déployer sur gpu1) | Débloque TOUTE la chaîne agentique prepare→approve→dispatch ; posture Rechat/Lofty « feu vert humain », absente du marché FR | L'agent nocturne propose 3 envois → l'humain en approuve 2 d'un clic → ils partent réellement (Resend) |
| 4 | **Boîte de sortie de brouillons** — relances rédigées → file de brouillons validables 1 clic → brouillon Gmail (Composio) ; porte la réactivation à prétexte réel (fusion 05·C1, absorbe 05·C3/03·C4/01·C5) | `/` sous l'ActionCenter + fiche `/leads/[id]` | M | **87** | **P** (Composio Gmail par tenant + table `rea_comm_drafts`) | Le trou entre « qui relancer » et « message parti » disparaît ; standard FUB/kvCORE « l'IA rédige, l'humain valide » | « 5 relances rédigées vous attendent » → clic → le brouillon est dans Gmail |
| 5 | **Débrief vocal de visite → CR** — fiche `/visits/[id]` (inexistante) : capture vocale → `visits.feedback` structuré, photos R2, statut, qualif à chaud acquéreur (fusion 08·C1+C2+C3, greffes 01·C1/05·C4/09·C5 via #4 et #14) | `/visits/[id]` (nouvelle fiche détail) + bloc mobile | M | **86** | **O** (colonne `visits.feedback` + PATCH existants, zéro UI) | <20 % des agents FR envoient un CR (Journal de l'Agence) ; rétention mandat + temps admin ; le CR vocal seul est table-stakes (Rechat AI Memo), le différenciant = la CHAÎNE voix→CRM→brouillon vendeur | Dicter 40 s dans la voiture → CR structuré en base → brouillon vendeur prêt à valider |
| 6 | **Sélection acquéreur partagée + 👍/👎** — lien signé, retour interactif écrit dans `prosp_match_feedback` (09·C1) | `/prospection` Matching (bouton « Partager la sélection ») + fiche `/leads/[id]` | M | **84** | **P** (2 tables + route publique écrivante sécurisée) | L'acquéreur trie lui-même ; l'agent visite les bons biens (RealScout US, rien d'équivalent FR grand public) | Envoyer une sélection → les 👍/👎 du client apparaissent en direct sur la fiche |
| 7 | **Rapport de commercialisation vendeur** — page publique signée : visites, offres, actions de l'agent (fusion 09·C2 + 05·C6) | `/mandates/[id]` + `/properties/[id]` → `/rapport/[token]` | M | **83** | **P** (agrégation `lib/reporting/seller.ts` à écrire) | Rétention du mandat exclusif — standard FR attendu (Hektor/Modelo/Apimo, adossé loi Alur) ; honnête : actions réelles, pas de fausses « vues portails » | Le vendeur ouvre son lien : visites passées/à venir, offres, actions — fin du « alors, ça avance ? » |
| 8 | **Radar d'ouverture de brochure** — tracking d'ouverture de l'avis de valeur partagé + signal « appelle maintenant » (fusion 04·C1+C6) | `ValuationHero` (partage) + `/` action center | M | **82** | **P** (table `estimation_share_events` + ping route PDF) | Conversion estimation→mandat : relancer à chaud (Cloud CMA : « call within the hour » ; absent du marché FR) | « Le vendeur a ouvert votre avis 3× ce matin » → tâche d'appel créée |
| 9 | **Score de priorité unifié** — next-best-action pondéré (urgence × valeur × risque), remplace le tri à 3 paliers (01·C2) | `/` action center | S | **81** | **O** | La liste du matin VRAIMENT ordonnée ; FUB = listes manuelles, Azigo GÉNÈRE l'ordre | La même donnée, mais la 1re ligne est toujours la bonne action |
| 10 | **Apprentissage des feedbacks** — les 👍/👎 stockés repondèrent les prochains matchs par tenant (03·C3) | `/prospection` Matching + Feedback | M | **80** | **O** | LE moat : donnée comportementale propriétaire par tenant, non copiable ; le moteur s'améliore visiblement | « Ce match est remonté parce que vous avez aimé 3 biens similaires » |
| 11 | **Câbler les critères déclarés** — exclusions/urgence/critères secondaires saisis mais IGNORÉS par le moteur (03·C5) | moteur `lib/prospection/matching/` | S | **79** | **O** (colonnes 0043 saisies, non lues) | Promesse tenue : une exclusion exclut, l'urgence priorise — score honnête | Saisir « rez-de-chaussée exclu » → le match RDC disparaît avec explication |
| 12 | **Radar mandats à expiration** — fenêtre 30/15/7 j sur `mandates.expires_at` (01·C3) | `/` action center + `/mandates` | XS | **78** | **O** | Zéro mandat perdu par oubli — feature phare Hektor (8 500 agences), parité attendue | Bandeau « 3 mandats expirent sous 15 j → préparer le renouvellement » |
| 13 | **Veille de valeur / relance datée** — dérive marché (index offline) sur estimations dormantes + `decision='a_relancer'` remontées (fusion 04·C2 + 01·C4) | `ContinuityPanel` + `/estimations` + `/` | M | **77** | **O** | Le « Homebot FR » : chaque estimation gratuite redevient un rendez-vous mandat daté (Homebot : 3-5 seller leads/100 contacts/mois) | « Votre estimation de mars : +2,1 % → relancez M. Martin, brouillon prêt » |
| 14 | **Registre de liens partagés + révocation** — socle RGPD de TOUTES les surfaces publiques (#5, #6, #7, brochure) (09·C6) | `/properties/[id]` réglages + fiches concernées | S | **76** | **P** (table `share_links`) | Habilitant : voir/couper chaque lien émis ; conformité droit de retrait | Un tableau « liens actifs » → bouton Révoquer → le lien meurt |
| 15 | **Carte de secteur prospection** — annonces géolocalisées (lat/lng 0015 jamais SELECT), clic → fiche/contact, tuiles OSM maison (07·C1) | `/prospection` onglets annonces + matching | S | **75** | **O** (1 ligne à ajouter au SELECT ; `staticmap.ts` réutilisé) | Le secteur visible d'un coup (Yanport : « baisses <24h sur votre zone » au cœur du dashboard) | La liste devient une carte : concentration d'opportunités évidente en 2 s |

## Lecture de la shortlist

- **3 habilitants à faire EN PREMIER** : #3 (débloque #1-agent, #2, #6, #7 côté envoi), #4 (porte #5, #13,
  la réactivation), #14 (porte #5, #6, #7). Sans eux, 6 items « livrent à moitié » (opus-10 §4.3).
- **5 vrais game-changers** (impact + agentique + premium simultanés) : #1, #2, #3, #4, #5.
- **4 quick wins 48 h** (XS/S, données O, effet démo immédiat) : #12, #9, #11, #15 (+ sparkline prix de #1).
- **Moat réel** (données qui s'épaississent, non copiables) : #10 (feedbacks), #1/#13 (historique prix +
  engagement), #3+#4 (l'actif gateway devient produit). Le reste ferme des gaps perçus (parité FR).
- **Prérequis ops signalé** (hors périmètre de cette mission, AUCUNE migration appliquée) : la migration
  `0045_alert_approvals.sql` n'est pas déployée sur gpu1 → `alerts.dispatch` répond DENIED tant qu'elle
  n'est pas posée. À planifier au début de la mission d'implémentation M1.
- Scores = grille du brief (impact 25 · quotidien 20 · démontrable 15 · agentique 15 · faisabilité 15 ·
  données 10, pénalités appliquées), consolidés par l'Opus 10 puis arbitrés ; décomptes détaillés dans les
  rapports sources.
