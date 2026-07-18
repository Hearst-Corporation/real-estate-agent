# SCREEN PLACEMENT MAP — REA-GAMECHANGER-005

> Où chaque ajout de la shortlist apparaît dans l'interface ACTUELLE. **Aucun nouveau menu top-level** :
> tout s'insère dans les écrans existants ; les seules routes nouvelles sont une fiche DÉTAIL d'une
> section existante (`/visits/[id]`) et des pages PUBLIQUES signées (pattern `/brochure/[token]` déjà
> en prod). Numéros = rangs de `EXECUTIVE-SHORTLIST.md`.

## `/` — Accueil (cockpit quotidien)
| Ajout | Emplacement précis | Frontière M04-08 |
|---|---|---|
| #9 Score de priorité unifié | Remplace le tri à 3 paliers DANS l'ActionCenter existant (`components/cockpit/ActionCenter.tsx`) — même carte, ordre généré | M04-08 densifie/hiérarchise l'affichage ; #9 change la LOGIQUE d'ordre (score pondéré) |
| #12 Radar mandats à expiration | Tuile/bandeau dans l'action center (source : `mandates.expires_at`) | Capacité nouvelle (détection), pas du polish |
| #1 Radar vendeur (sortie) | Tâches `rea_tasks` type `opportunite_vendeur` injectées dans l'ActionCenter | Le Radar POSE des tâches ; M04-08 les AFFICHE |
| #4 Boîte de sortie | Panneau « Brouillons à valider » sous l'ActionCenter | Surface nouvelle (file de brouillons), pas une densification |
| #3 Centre d'approbation (widget) | Compteur « N actions d'agent en attente » → lien `/agents` | Widget de renvoi uniquement |
| #8 Radar brochure / #13 Veille de valeur (sorties) | Tâches « le vendeur a ouvert votre avis » / « estimation à relancer (+X %) » dans l'action center | Sources de tâches nouvelles |

## `/prospection` (5 onglets existants : annonces, matching, critères, feedback, historique)
| Ajout | Emplacement précis |
|---|---|
| #1 Radar vendeur | **6ᵉ onglet « Radar »** (liste scorée `scoreMandat` + badges baisse/stagne/republié/retiré/PAP + action « préparer le contact ») — extension d'un écran existant, pas de menu top-level |
| #1-compagnon Historique de prix | Section sparkline + Δ vs marché dans `AnnonceDetailDialog` (dialog existant) |
| #15 Carte de secteur | Toggle liste/carte dans les onglets **annonces** et **matching** (tuiles OSM via `staticmap.ts` réutilisé, lat/lng déjà en base) |
| #2 Off-market push | Onglet **matching** : les biens du portefeuille entrent dans le pool matché ; bloc « Acquéreurs compatibles » aussi sur `/properties/[id]` |
| #6 Sélection acquéreur partagée | Onglet **matching** : sélection multi-matchs → bouton « Partager la sélection » (lien signé) ; retours 👍/👎 visibles sur l'onglet **feedback** et la fiche lead |
| #10 Apprentissage des feedbacks | Onglet **matching** : badge « ajusté par vos retours » sur le score ; onglet **feedback** : impact visible |
| #11 Critères câblés | Invisible en UI propre : le moteur (`lib/prospection/matching/`) respecte enfin exclusions/urgence/secondaires ; l'explication « Pourquoi ce match » les cite |

## `/estimations` + `/estimations/[id]`
| Ajout | Emplacement précis |
|---|---|
| #8 Radar d'ouverture de brochure | `ValuationHero` (bloc partage) : état « ouvert N fois, dernière fois il y a X » ; historique dans le SidePanel |
| #13 Veille de valeur | `ContinuityPanel` : ligne « valeur estimée aujourd'hui (indicatif national) + Δ depuis l'estimation » sur les estimations `a_relancer`/dormantes ; liste `/estimations` : colonne « dérive » |

## `/visits` → **nouvelle fiche `/visits/[id]`** (route détail d'une section existante)
| Ajout | Emplacement précis |
|---|---|
| #5 Débrief vocal → CR | La fiche porte : statut de visite, capture vocale (Web Speech, fallback saisie) → `visits.feedback` structuré, photos (R2), **qualif à chaud** (chaud/tiède/froid + freins → lead), détection « CR manquant » (tâche accueil), bouton « Brouillon vendeur » (via #4) et « Partager le CR » (via #14) |

## `/leads/[id]`
| Ajout | Emplacement précis |
|---|---|
| #4 Boîte de sortie (entrée locale) | Bouton « Préparer une relance » + liste des brouillons liés au lead |
| #6 Sélection partagée (retours) | Bloc « Sa sélection : 3 👍 · 2 👎 · 1 commentaire » |

## `/properties/[id]` + `/mandates` + `/mandates/[id]`
| Ajout | Emplacement précis |
|---|---|
| #2 Off-market (vue bien) | Bloc « Acquéreurs compatibles (N) » sur la fiche bien à la signature du mandat |
| #7 Rapport de commercialisation | `/mandates/[id]` (et fiche bien liée) : bouton « Partager le suivi au vendeur » → page publique `/rapport/[token]` |
| #14 Registre de liens | Section « Liens partagés » (réglages de la fiche bien) : liste + révocation ; vue agrégée possible dans `/profile` |
| #12 Radar expiration (vue liste) | `/mandates` : badge « expire dans X j » + filtre |

## `/agents`
| Ajout | Emplacement précis |
|---|---|
| #3 Centre d'approbation | Onglet « Approbations » (file create→approve→dispatch sur `agent_alert_approvals`) + onglet « Journal » (UI de `agent_gateway_audit_log`) — la page registre/RunTracker existante reste |

## Chat Cockpit (rail droit)
| Ajout | Emplacement précis |
|---|---|
| #1 (tools) | 2 tools : `list_mandate_opportunities` + `prepare_seller_contact` (registre `lib/agent/tools/`) — le chat sait lister le Radar et préparer un brouillon (HITL conservé) |

## Pages publiques signées (pattern `share.ts` existant, JWT + expiration + révocation via #14)
- `/selection/[token]` (#6) — lecture sélection + écriture feedback 👍/👎 (rate-limitée, anti-énumération)
- `/rapport/[token]` (#7) — rapport vendeur (agrégats anonymisés, jamais de nom de visiteur)
- `/brochure/[token]` (existant) — instrumentée par #8 (ping d'ouverture fire-and-forget)
