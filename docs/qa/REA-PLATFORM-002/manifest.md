# Manifest captures — REA-PLATFORM-002

Preuves visuelles des parcours augmentés. Prises sur **serveur local** au commit **`97fc025`**
(branche `feature/rea-platform-augmented-002` = base présentation `90fd423` + migration 0043 +
A1 acquéreurs + A2 estimation/mandats + A3 CRM/actions + A4 Aigent/QA), `AUTH_DEV_BYPASS`.

**Compte / données** : tenant `real-estate-agent`, user admin. Données = **jeu démo anonymisé
Antibes** enrichi pour les features 0043 (critères avec fréquence/urgence/exclusions, 4 tâches
`rea_tasks`, estimation avec continuité propriétaire « Démo Antibes »/mandat brouillon/décision/
ajustement manuel). Emails `@demo-*.local`, téléphones `06 00 00 00 0X`. **Aucune PII client réelle.**
Le motif « téléphone » et parfois « email » se déclenchent sur ces placeholders + sur l'email du
**compte admin de l'app** (`admin@real-estate-agent.app`, affiché car session dev-bypass) — **faux
positifs vérifiés**, jamais de donnée client.

Vérif systématique avant chaque capture : `href` conforme, **console 0 erreur**, `scrollWidth ≤
innerWidth` (0 scroll horizontal), scan `[SEED]`/PII.

| # | Fichier | Route | Viewport | Données / état | Console | Overflow | Statut |
|---|---------|-------|----------|----------------|---------|----------|--------|
| 01 | `01-accueil-centre-actions.webp` | `/` | 1440×900 | centre d'actions (relances/RDV/validations dérivés + tâches) | 0 err | non | **LIVE/SNAPSHOT** |
| 02 | `02-prospection-profils.webp` | `/prospection` (Profils) | 1440×900 | profils acquéreur (urgence/essentiels/secondaires/exclusions) | 0 err | non | **LIVE/SNAPSHOT** |
| 03 | `03-prospection-matching.webp` | `/prospection` (Matching) | 1440×900 | matching expliqué (satisfaits/imparfaits/bloquants/action) | 0 err | non | **LIVE/SNAPSHOT** |
| 04 | `04-prospection-alertes.webp` | `/prospection` (Alertes) | 1440×900 | fréquence par profil (LIVE) + **envoi = Aperçu/CONFIG** | 0 err | non | **LIVE + UNAVAILABLE (envoi)** |
| 05 | `05-prospection-historique.webp` | `/prospection` (Historique) | 1440×900 | propositions retenues/refusées (match_feedback) | 0 err | non | **LIVE/SNAPSHOT** |
| 06 | `06-estimation-continuite.webp` | `/estimations/[id]` | 1440×900 | pipeline Estimation→Propriétaire→Opportunité→Décision + composition calculé/saisi/manquant/à-vérifier | 0 err | non | **LIVE/SNAPSHOT** |
| 07 | `07-fiche-acquereur.webp` | `/leads/[id]` | 1440×900 | fiche acquéreur (Famille Rossi, anonyme) | 0 err | non | **SNAPSHOT** |
| 08 | `08-agenda.webp` | `/agenda` | 1440×900 | visites liées bien+contact | 0 err | non | **SNAPSHOT** |
| 09 | `09-aigent-frontiere.webp` | `/profile` (Copilotes IA) | 1440×900 | **frontière Aigent — « Non connecté / En spécification »**, 7 capacités désactivées, frontières dures | 0 err | non | **UNAVAILABLE (honnête)** |
| 10 | `10-accueil-mobile.webp` | `/` | 390×844 | centre d'actions responsive | 0 err | non | **LIVE/SNAPSHOT** |
| 11 | `11-prospection-matching-mobile.webp` | `/prospection` (Matching) | 390×844 | matching responsive | 0 err | non | **LIVE/SNAPSHOT** |
| 12 | `12-estimation-continuite-mobile.webp` | `/estimations/[id]` | 390×844 | continuité responsive | 0 err | non | **LIVE/SNAPSHOT** |

**Résumé QA** : 12/12 — **0 erreur console**, **0 scroll horizontal** (desktop 1440 ET mobile 390).
A4 a aussi validé 768×1024 sur toutes les routes (matrice dans LAST_REPORT). Suite Playwright
exhaustive non commitée (temporaire supprimée du repo).

**Confidentialité** : les captures publiques `docs/screenshots/03-clients.png` et `07-prospection.png`
(qui exposaient des noms/téléphones réels) ont été **remplacées dans cette branche** par des versions
anonymisées de l'UI actuelle (les 7 `docs/screenshots/*.png` rafraîchies). L'historique Git n'est PAS
réécrit (purge complète = mission dédiée).
