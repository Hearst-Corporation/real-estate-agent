# ROADMAP 48H / 7J / 21J — REA-GAMECHANGER-005

> Cadence de livraison de la shortlist (numéros = `EXECUTIVE-SHORTLIST.md`). Hypothèse d'exécution :
> orchestration multi-workers habituelle (missions parallèles, cf. `IMPLEMENTATION-MISSIONS.md`) — les
> fenêtres sont du TEMPS CALENDAIRE, pas des jours-homme. Chaque fenêtre se termine démontrable
> (gate verte + vérification browser).

## ⏱️ 48 HEURES — « la plateforme a l'air 2× plus intelligente » (existant pur, données O)

Objectif : effets très visibles, quasi zéro risque, aucune table nouvelle, aucune dépendance.

| Ajout | Taille | Ce qui se voit |
|---|---|---|
| #12 Radar mandats à expiration | XS | Bandeau accueil + badges `/mandates` — « 3 mandats expirent sous 15 j » |
| #9 Score de priorité unifié | S | L'action center s'ordonne par un score pondéré expliqué (plus de tri à 3 paliers) |
| #11 Câbler exclusions/urgence/critères secondaires dans le moteur | S | Les critères saisis agissent enfin ; « Pourquoi ce match » les cite |
| #15 Carte de secteur prospection | S | Toggle carte sur les annonces (lat/lng dormants + `staticmap.ts` réutilisé) |
| #1-tranche 1 : Historique de prix (sparkline + Δ) dans `AnnonceDetailDialog` | S | Chaque annonce montre sa trajectoire de prix — donnée `prosp_annonce_versions` enfin visible |
| Prérequis ops à planifier (15 min, décision Adrien) : déployer la migration `0045` sur gpu1 | — | Condition du dispatch réel de la vague 7 j (sinon #3 reste en mode « préparation seule ») |

**Démo 48 h** : ouvrir l'accueil (liste scorée + mandats à renouveler), ouvrir une annonce (sparkline de
baisse), basculer la carte du secteur. Trois « wow » sans une seule table nouvelle.

## 📅 7 JOURS — parcours métier complets (le socle + les 2 premiers game-changers)

Objectif : les 3 habilitants posés + le Radar vendeur complet + la visite de bout en bout.

| Ajout | Taille | Parcours complet livré |
|---|---|---|
| #1 Radar vendeur (onglet Radar + scoring + tâches accueil + 2 tools chat) | M | Signal détecté → opportunité scorée → tâche du matin → « préparer le contact » |
| #3 Centre d'approbation + Journal d'activité | M | Une action préparée → file d'approbation → approbation 1 clic → dispatch réel (si 0045 posée) → trace au journal |
| #4 Boîte de sortie de brouillons (+ table `rea_comm_drafts`, Composio Gmail) | M | « Qui relancer » → brouillon rédigé → validation → brouillon Gmail réel |
| #5 Fiche `/visits/[id]` tranche 1 : statut + capture vocale → `visits.feedback` + qualif à chaud | M | Visite terminée → dictée 40 s → CR structuré en base → lead qualifié → tâche CR manquant éteinte |
| #14 Registre de liens partagés | S | Tout lien émis est listé/révocable (socle des surfaces de la vague 21 j) |

**Démo 7 j** : le scénario « matin » complet — brief scoré, opportunité Radar, brouillon de contact validé
en un clic, retour de visite dicté, CR en base.

## 🚀 21 JOURS — avantages agentiques différenciants (ce que personne n'a en FR)

Objectif : la chaîne agentique visible + les surfaces client + les boucles qui construisent le moat.

| Ajout | Taille | Différenciation |
|---|---|---|
| Agent **Vigie nocturne** V1 (cron Inngest) pilotant le Radar → `alerts.prepare` → approbation → dispatch ; puis V2 agent LangGraph externe publié au registre (`/agents` montre des runs réels) | M | « Pendant que vous dormez, Azigo trouve les vendeurs et prépare les contacts » — 1er FR à automatiser l'alerte |
| #2 Off-market push portefeuille ↔ acquéreurs | M | « Mandat signé à 19h → acquéreurs identifiés à 7h » (parité matchimo, intégrée au CRM) |
| #6 Sélection acquéreur partagée + 👍/👎 (`/selection/[token]`) | M | Recherche collaborative type RealScout, inexistante en FR grand public |
| #7 Rapport de commercialisation vendeur (`/rapport/[token]`) | M | Parité Hektor/Modelo (loi Alur), honnête (activité réelle) — module premium naturel |
| #8 Radar d'ouverture de brochure (table `estimation_share_events`) | M | « Le vendeur a ouvert votre avis 3× → appelez » (Cloud CMA, absent FR) |
| #13 Veille de valeur / relance datée | M | Le Homebot FR : chaque estimation dormante redevient un RDV mandat |
| #10 Apprentissage des feedbacks (repondération par tenant) | M | Le moat : le moteur s'améliore avec l'usage, non copiable |
| #5 tranches 2-3 : photos R2 + brouillon vendeur (via #4) + CR partageable (via #14) | S+S | La chaîne visite complète voix→CRM→vendeur, qu'aucun FR n'assemble |

**Démo 21 j** : la boucle intégrale — la nuit la Vigie détecte, le matin l'agent approuve, le brouillon
part, l'acquéreur vote sur sa sélection, le vendeur consulte son rapport, le moteur apprend des retours.

## Dépendances dures (à ne pas inverser)
1. `0045` déployée AVANT le dispatch réel de #3 (sinon #3 livre la préparation seule — acceptable mais dit).
2. #4 avant les greffes « brouillon vendeur » (#5-t2) et la réactivation (extension de #4).
3. #14 avant les surfaces publiques nouvelles (#6, #7, partage CR).
4. #3 + Vigie V1 avant tout agent externe au registre (zéro faux run, valeur démontrable d'abord).
5. #1 avant #2-alerte-baisse-acquéreur (l'intersection Radar × matching émerge gratuitement, cf. opus-10 F11).
