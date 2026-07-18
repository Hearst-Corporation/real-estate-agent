# REJECTED IDEAS — REA-GAMECHANGER-005

> Idées écartées par le conseil (10 rapports) et par l'arbitrage final. Chaque rapport contient sa liste
> complète (§5) ; ici : les rejets MAJEURS et leur raison, pour ne pas les re-proposer dans 3 mois sans
> nouvel élément. Catégories du §7 de la mission.

## 1. Violations de la règle dure (communication non consentie / sans HITL)
| Idée | Proposée par | Raison du rejet |
|---|---|---|
| Envoi automatique d'alertes/SMS/WhatsApp sans brouillon ni validation | 02, 03, 04, 05, 06 (variantes) | Règle dure mission + RGPD (−20) ; transport non branché de surcroît |
| Chatbot SDR / ISA 24/7 répondant seul aux leads (façon Structurely/Ylopo) | 05, 06 | Envoi direct sans feu vert humain = interdit ; remplacé par le qualificateur EN BROUILLON (lui-même différé, cf. §6) |
| Agent voix sortant (appels automatiques) | 06 | Twilio Voice absent + RGPD + pas de HITL possible en live |
| Enregistrement audio intégral des visites / OCR pièce d'identité | 08 | RGPD frontal (consentement, minimisation) |

## 2. Données ou intégrations indisponibles (−15 chacun, souvent rédhibitoire)
| Idée | Proposée par | Raison |
|---|---|---|
| Prédiction vendeurs 6-12 mois type SmartZip/Offrs (« Seller Score » 250+ pts) | 02 | Datasets US (hypothèques, durée de possession…) inexistants en accès FR |
| Scoring comportemental web / alertes IDX (kvCORE-like) | 01, 03, 05 | Aucun portail IDX ni pixel de tracking : la donnée comportementale n'existe pas |
| Vues des portails externes dans le rapport vendeur | 09 | Pas de MLS/API portails → afficher des « vues » serait mentir ; le rapport (#7) montre l'activité RÉELLE |
| Two-way SMS / WhatsApp direct | 03, 05 | Twilio/WhatsApp Business absents (clés et transport) |
| Signature électronique (mandats, bons de visite) | 08, 09 | Aucune brique e-sign câblée (Yousign/DocuSign = dépendance externe) ; le bon de visite signable (08·C4) reste en réserve avec signature tactile maison — non retenu dans le top |
| Ré-estimation automatique via MoteurImmo | 04 | Clés absentes → remplacé par l'index national offline (#13, avec cadrage « indicatif ») |
| Matterport / visites 360 | 08 | Intégration absente, coût, hors game-changer immédiat |
| Dashboard coûts/tokens des agents | 06 | Registre Aigent vide → donnée non peuplée |

## 3. XL, infra majeure ou refonte (−20/−25 → éliminés ou découpés)
| Idée | Proposée par | Raison |
|---|---|---|
| Portail client logué (comptes vendeur/acquéreur) | 09 | GoTrue/Realtime absents = infra majeure + « portail 6 mois » explicitement exclu ; remplacé par les liens signés (#6, #7) |
| PWA offline complète / app native | 08 | Contrainte mission « mobile web existant » ; infra majeure |
| Éditeur de séquences drag-and-drop | 05 | XL ; réduit à des cadences fixes approuvables (absorbé sous #4, différé) |
| Refonte ML du barème de matching / ML maison | 02, 03 | Refonte profonde (−25) ; l'apprentissage par feedbacks (#10) fait le travail en additif |
| Extension navigateur type Castorus | 02 | Nouvelle surface produit complète (infra) ; le Radar (#1) couvre le besoin côté serveur |
| Moteur d'orchestration agents interne | 06 | Interdit (décision produit : agents EXTERNES via Aigent) + duplique M04-04 |
| Streaming SSE temps réel des runs | 06 | Supabase Realtime absent ; le polling existant suffit |

## 4. Doublons des missions M04 en cours (élimination immédiate)
| Idée | Doublonne | Note |
|---|---|---|
| Réordonner l'accueil par buckets temporels, densifier l'action center | M04-08 | La frontière retenue : M04-08 = affichage/hiérarchie ; shortlist = logique nouvelle (#9, #12, sources de tâches) |
| Densification des 5 onglets prospection | M04-09 | Le Radar est un ONGLET NOUVEAU avec capacité nouvelle |
| Câblage `leads.financement` bout-en-bout | M04-06 | Cité comme dépendance par 03/06, jamais re-proposé |
| RLS prospection, durcissement gateway/runtime, providers estimation, PDF/partage durci, Electron, QA | M04-03/02/04/12/13/14 | Signalés et évités par tous les rapports |
| Fiches CRM denses / timeline comme densité | M04-11 | Voir §5 : la timeline unifiée est rejetée aussi pour ça |

## 5. Candidats ≥70 ÉLIMINÉS par l'arbitrage final (les cas difficiles, opus-10 §4.2)
| Candidat (score d'origine) | Raison précise |
|---|---|
| **Timeline unifiée lead/bien** (05·C2 85, 01·C8 74) | Vue de LECTURE sans agentique ni moat ; score gonflé ; recoupe M04-11 (densité déguisée). Rang 16-18, pas game-changer. À reconsidérer après la vague 1 |
| **Pipeline de conversion estimation→mandat** (04·C3 82) | Outil de PILOTAGE hebdo, pas d'usage quotidien ; l'esprit funnel recoupe M04-08. La donnée `decision` est déjà exploitée par #13 |
| **Nuage de comparables DVF** (07·C3 82) | Beau support de présentation, mais zéro conversion mesurable, zéro agentique, zéro accumulation — cosmétique premium, rang 16 |
| **Trio réactivation autonome** (01·C5 80, 03·C4 80, 05·C3 83) | Fusionnés (F4) : 100 % dépendants de la Boîte de sortie (#4) — ce sont des MODES D'EMPLOI de #4, livrés comme extension une fois #4 posé |
| **Boucle prix conseillé ↔ prix vendu** (04·C5 74) | Dépend d'une saisie manuelle (`sold_price` à créer), effet maigre au démarrage ; crédibilité long-terme, pas démontrable à 21 j |
| **Qualificateur ISA brouillon / Lancer un agent depuis la fiche / Cron produit** (06·C4 78, C5 74, C6 72) | Prématurés : registre Aigent VIDE → valeur nulle en démo tant que #3 + Vigie n'existent pas. File d'attente post-vague 3 |
| **Entonnoir transverse cross-module** (07·C7 72) | Cohorte « imparfaite » (volumes non chaînés) = KPI décoratif déguisé ; recoupe M04-08 |
| **Carte du portefeuille** (07·C4 79) | `properties` sans lat/lng → géocodage à câbler d'abord ; la carte de SECTEUR (#15, données O) passe devant |
| **Écart prix demandé↔estimation / matrice positionnement prix** (02·C6 72, 07·C5 76) | Même calcul `priceVsMarket()` : compagnons du Radar (#1) et de la Veille (#13), pas des items autonomes |
| **Historique de prix comme item séparé** (02·C2 86, 07·C2 84) | Doublon franc entre eux → fusionné DANS #1 (section du détail annonce) |
| **Assistant tools signaux comme item séparé** (02·C7 71) | Surface chat du Radar → livré AVEC #1 |
| **Briefing quotidien généré** (01·C7 76) | Sans appel LLM il se réduit au score de priorité (#9) qui le couvre ; la synthèse LLM = coût/valeur faible vs la liste scorée elle-même |
| **Fraîcheur du portefeuille (tuile)** (01·C5 80) | Vue secondaire absorbée par #9 (le score intègre l'ancienneté de contact) |

## 6. Gadgets / KPI sans action (éliminés d'office par la règle du brief)
Graphiques décoratifs, KPI sans action associée, heatmap ville sans granularité exploitable, carte des
acquéreurs (zones = polygones non persistés), comparateur multi-portails (dédup non fiabilisée),
score de match en barres comme item autonome (07·C6 — polish d'un affichage existant, absorbable au fil
de l'eau), résumé LLM du brief matinal (gadget, coût API). Proposés puis auto-éliminés par les rapports.
