# Manifest captures — REA-PRESENT-001

Preuves visuelles de la passe présentation premium. Captures prises sur un **serveur
local** au commit code **`0660ded`** (branche `feature/rea-presentation-premium-001`,
= A1 shell/accueil + A2 estimation + A3 prospection/CRM + A4 AA/QA), avec `AUTH_DEV_BYPASS`.

**Compte / données** : tenant de présentation `real-estate-agent`, user admin. Données =
**jeu de démo anonymisé Côte d'Azur** (villes Antibes / Cannes / Juan-les-Pins / Cap
d'Antibes), inventé de bout en bout : emails `@demo-*.local`, téléphones placeholder
`06 00 00 00 0X`, annonces **sans** email/téléphone vendeur. **Aucune donnée personnelle
réelle.** Marqueur `DÉMO-06` présent uniquement dans les champs `notes` (contenu
secondaire) pour l'idempotence/purge — visible p.ex. sur la fiche client (04), assumé et
honnête (signale la donnée de démo, jamais maquillée en réelle).

L'estimation « résultat » (06/12) est une estimation réelle **clonée puis PII-scrubbée**
(adresse → `18 avenue des Mimosas` fictive, coordonnées → centre d'Antibes générique,
tél/email → placeholders), re-localisée Antibes — statut **SNAPSHOT**.

Vérif systématique avant chaque capture : `href` conforme, **console 0 erreur**,
`scrollWidth ≤ innerWidth` (0 scroll horizontal), scan `[SEED]`/téléphone/email-réel.
Les captures 02 et 04 déclenchent le motif « téléphone » = **faux positif vérifié** (ce
sont les placeholders `06 00 00 00 0X` du jeu démo), pas de PII.

| # | Fichier | Route | Viewport | État testé | Source données | Statut | Commit |
|---|---------|-------|----------|-----------|----------------|--------|--------|
| 01 | `01-accueil-desktop.webp` | `/` | 1440×900 | success (KPI + à-faire + opportunités + portefeuille) | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 02 | `02-prospection-acquereurs-desktop.webp` | `/prospection` (Acquéreurs) | 1440×900 | success (3 critères acquéreur) | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 03 | `03-prospection-matching-desktop.webp` | `/prospection` (Matching) | 1440×900 | success (4 matchs, scores 91/84/78/52, « Pourquoi ce match ») | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 04 | `04-fiche-client-desktop.webp` | `/leads/[id]` (Famille Rossi) | 1440×900 | success (identité, budget, critères) | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 05 | `05-estimation-creation-desktop.webp` | `/estimations/new` → wizard | 1440×900 | success (lancement entretien, brouillon vide) | flux réel | **LIVE** | `0660ded` |
| 06 | `06-estimation-resultat-desktop.webp` | `/estimations/[id]` | 1440×900 | success (valeur 1 180 000 €, fourchette, confiance, provenance 4 comparables) | estimation clonée PII-scrubbée | **SNAPSHOT** | `0660ded` |
| 07 | `07-fiche-bien-desktop.webp` | `/properties/[id]` (Villa Cap d'Antibes) | 1440×900 | success (fiche bien premium) | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 08 | `08-agenda-desktop.webp` | `/agenda` | 1440×900 | success (visites à venir) | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 09 | `09-estimations-liste-desktop.webp` | `/estimations` | 1440×900 | success (liste + KPI valeur moy.) | données réelles + snapshot | **SNAPSHOT** | `0660ded` |
| 10 | `10-accueil-mobile.webp` | `/` | 390×844 | success responsive (rails masqués, bottom bar) | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 11 | `11-prospection-matching-mobile.webp` | `/prospection` (Matching) | 390×844 | success responsive | seed démo anonymisé | **SNAPSHOT** | `0660ded` |
| 12 | `12-estimation-resultat-mobile.webp` | `/estimations/[id]` | 390×844 | success responsive (hero reflow) | estimation clonée PII-scrubbée | **SNAPSHOT** | `0660ded` |

**Non capturé** : `13-assistant` — le rail Assistant rend proprement (titre, invite, champ,
0 erreur) mais aucun message n'y était affiché ; le remplir aurait exigé un appel LLM live
(non forcé). Assistant **présent** (visible sur 04) mais capture d'action utile **différée**.

**Résumé QA** : 12/12 écrans — **0 erreur console**, **0 scroll horizontal** (desktop 1440
ET mobile 390). Suite Playwright exhaustive non commitée (artefacts temporaires supprimés).
