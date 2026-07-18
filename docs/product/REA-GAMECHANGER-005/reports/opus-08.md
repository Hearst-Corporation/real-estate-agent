# REA-GAMECHANGER-005 — Opus 08 · Terrain, Mobile & Visites

> Domaine : usages EN DÉPLACEMENT de l'agent immobilier. Capture rapide sur le terrain (VOIX, photos,
> checklist), déroulé de visite, qualification à chaud de l'acquéreur juste après la visite, flux
> visite → CRM sans ressaisie. Contrainte dure respectée partout : **AUCUNE app native**. Tout se joue
> sur le **web mobile responsive EXISTANT** (bottom bar `BottomBar.tsx`, rails masqués `max-sm`) + Electron
> desktop. Toute communication sortante reste **brouillon / validation humaine** (RÈGLE DURE brief).
>
> **Frontière produit majeure — lue dans les rapports voisins :** Opus 05 (candidat #4, `opus-05.md`)
> possède déjà **« Compte rendu structuré → brouillon vendeur »**. Je NE le duplique PAS. Opus 05 produit
> le *brouillon d'email vendeur* à partir de 4 champs saisis ; **moi je produis la MATIÈRE qu'il n'a pas :
> la CAPTURE terrain** (dictée vocale transcrite + structurée, photos de visite, checklist, présence,
> qualif à chaud). Mes candidats **alimentent** son brouillon — je cite la jonction à chaque fois.
> M04-07 = shell responsive + assistant contextuel (polish) ; M04-08 = accueil/agenda + `rea_tasks` ;
> M04-13 = Electron. J'étends `/visits` avec des capacités NOUVELLES, jamais de la densité.

---

## Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes (O/P/N) | Effet business (1 ligne) |
|---|----------|-------|--------|-------|------------------------|--------------------------|
| 1 | **Débrief vocal de visite → CR structuré (voix → texte → `visits.feedback`)** | `/visits/[id]` (NOUVELLE fiche) + bloc mobile | M | **89** | O | L'agent dicte 40 s dans sa voiture → un compte rendu propre en base, sans ressaisie ; **la matière du brouillon vendeur d'Opus 05 arrive enfin toute seule.** |
| 2 | **Fiche visite terrain : checklist + photos + statut réalisée en un écran** | `/visits/[id]` (NOUVELLE) | M | **84** | O | La visite cesse d'être une ligne morte : sur place, l'agent coche, prend 3 photos (R2 existe), passe « réalisée » — le suivi devient systématique. |
| 3 | **Qualif acquéreur à chaud post-visite (chaud/tiède/froid + budget + frein → lead mis à jour)** | `/visits/[id]` panneau + fiche lead | S | **82** | O | Juste après la visite, 4 boutons qualifient l'acheteur et poussent son `status`/budget/notes dans le CRM → aucun prospect chaud ne refroidit faute de saisie. |
| 4 | **Bon de visite / feuille de présence signable sur mobile (signature tactile → PDF R2)** | `/visits/[id]` → PDF signé | M | **78** | P | Le bon de visite (norme FR, sécurise la commission) se signe du doigt sur le téléphone du visiteur, PDF horodaté rangé sur le bien — fin du papier. |
| 5 | **Mode terrain « à côté de ce bien » : comparables + fiche du bien hors-ligne-friendly** | `/properties/[id]` bouton + accueil | S | **74** | O | Devant le bien, l'agent sort en 2 s le prix, les comparables DVF et la fiche — argumentaire chiffré immédiat en RDV, sans fouiller. |
| 6 | **Capture éclair depuis la bottom bar (bouton « + » : note vocale / photo → tâche `rea_tasks`)** | `BottomBar.tsx` (bouton central) | S | **72** | O | Une pensée en marchant = un appui : note dictée ou photo capturée deviennent une tâche tracée, jamais perdue entre deux RDV. |

Tous ≥ 70, classés par score. Décompte détaillé en §4. **Aucun** ne duplique une mission M04 ni le candidat #4 d'Opus 05 (frontière capture vs brouillon explicitée par candidat).

---

## Lecture du terrain

### Fichiers vérifiés (chemins + lignes)

- **`supabase/migrations/0008_crm.sql` l.77-94** — table `visits` : colonnes `status`
  (`planifiee|confirmee|realisee|annulee|no_show`), `property_id`, `lead_id`, `scheduled_at`,
  `duration_min`, **`feedback text`** ET **`notes text`**. **Découverte clé : `feedback` existe DÉJÀ
  en base et n'est JAMAIS écrit ni affiché.** RLS owner+tenant l.157-171, index sur `status/property/lead/scheduled`.
- **`app/api/visits/[id]/route.ts` l.46** — le **PATCH accepte DÉJÀ `feedback`** dans son allowlist
  (`["status","feedback","notes","scheduled_at","duration_min","lead_id"]`), owner-check user+tenant
  l.86-87, validation `status` contre l'enum l.50-54, rattachement `lead_id` vérifié l.67-78. **Le backend
  du compte rendu est écrit et fonctionnel ; il n'a AUCUNE UI.** GET (l.14) et DELETE (l.98) présents.
- **`app/(dashboard)/visits/page.tsx`** — liste + KPI (Funnel/Donut) + `StatusSelect` inline (l.146,
  endpoint `/api/visits/{id}`) + `DeleteButton`. **Aucune fiche détail `/visits/[id]`, aucun champ
  `feedback`/photos.** `VisitForm.tsx` (création) ne collecte que property/lead/date/durée/notes — pas de feedback.
- **`lib/storage/r2.ts`** — `putObject/getObject/deleteObject/publicUrl/presignedUrl/r2IsConfigured`,
  fail-soft si non configuré. **R2 opérationnel.**
- **`app/api/properties/[id]/photos/route.ts`** — patron d'upload multipart COMPLET et réutilisable :
  `formData` l.80 → validation MIME (`jpeg/png/webp/heic`) l.91 → limite 10 Mo l.97 → **magic-bytes**
  (`isValidImageContent`, `lib/storage/magic-bytes.ts`) l.122 → `putObject` R2 l.126 → row `property_photos`
  l.129 → **compensation R2 si insert DB échoue** l.144. Rate-limit 20/60 s l.62. **Un upload de photo/audio
  de visite est un copier-coller de ce fichier** (table + préfixe de clé différents).
- **`app/api/documents/parse/route.ts`** — upload multipart + hash sha256 + cache R2 + **cost-guard**
  (`paidCall`, cap quotidien) : la preuve qu'un pipeline « fichier terrain → traitement → R2, idempotent
  et plafonné » existe déjà comme référence (mais LlamaParse = **dépendance payante**, `DOC_INTEL_ENABLED`).
- **`lib/llm/openai.ts` l.58 + `lib/llm/kimi.ts` l.32 + `lib/agent/run.ts`** — SDK `openai` **installé et
  instancié côté serveur**, `OPENAI_API_KEY` déjà câblée (`openaiIsConfigured()`). **Conséquence majeure
  pour la voix : `openai.audio.transcriptions.create()` (Whisper) est atteignable AVEC LA CLÉ EXISTANTE,
  zéro nouvelle dépendance ni nouvelle clé.**
- **`.env.example`** — `DEEPGRAM_API_KEY` **listée en `[OPTIONNEL] transcription`** MAIS **AUCUN code ne
  l'utilise** (grep `deepgram|whisper|transcri|MediaRecorder|SpeechRecognition` sur `lib/` + `app/` +
  `components/` = **0 résultat**). Honnêteté brief : la voix serveur n'est PAS câblée aujourd'hui ; deux
  voies honnêtes existent (voir matrice STT ci-dessous).
- **`lib/agent/tools/crm.ts`** — `create_visit` l.375 (écrit `notes`, **pas `feedback`**), `list_visits`
  l.423, `create_lead` l.73 (champs `status/budget_min/budget_max/notes/source` — tout ce qu'il faut pour
  la qualif à chaud), enum `LEAD_STATUSES` (`nouveau→contacte→qualifie→visite→offre→gagne|perdu`).
- **`components/cockpit/BottomBar.tsx`** — bottom bar mobile (`max-sm:block`, l.31), `MOBILE_SHORTCUTS`
  (`config/nav.ts`), cibles ≥ 44px (`min-h-11`), accent focus visible. **Point d'ancrage d'un bouton
  capture central.**
- **`supabase/migrations/0043_platform_augmented_002.sql` l.37** — `rea_tasks` (action center) : `entity_type`
  inclut **`'visit'`**, `kind` inclut `relance/rdv/note`, `due_at`, `status` (`open/done/snoozed`).
  **Une capture éclair devient une `rea_tasks` sans nouvelle table** ; API `app/api/tasks/route.ts` + `[id]`.
- **`lib/prospection/contact.ts` l.1-40** — machine à états `draft → approved → sent`, `confirmed:true`
  humain requis, mode dégradé dry-run. + `lib/agent/tools/estimation.ts` l.162-177 (`send_estimation`
  HITL `confirmed:true`). **C'est le rail d'Opus 05 ; mes CR y débouchent, je ne le refais pas.**

### Matrice de capacités — mon domaine

| Capacité | État réel | Preuve (fichier:ligne) |
|---|---|---|
| Colonne `visits.feedback` | **AVAILABLE persisté, JAMAIS exposé UI** | `0008_crm.sql:90` ; `api/visits/[id]/route.ts:46` |
| PATCH visite (status/feedback/notes/lead) | **AVAILABLE, sans UI de détail** | `api/visits/[id]/route.ts:33-96` |
| Upload photo + R2 + magic-bytes + compensation | **AVAILABLE (patron réutilisable)** | `api/properties/[id]/photos/route.ts` ; `lib/storage/r2.ts` |
| Transcription voix côté navigateur (Web Speech API) | **AVAILABLE gratuit, non exploité** (natif, aucune clé) — FR correct sur Chrome/Edge/Safari | `webkitSpeechRecognition` absent du repo = à ajouter côté client |
| Transcription voix côté serveur (Whisper via SDK `openai`) | **AVAILABLE avec la clé existante** (aucune nouvelle dépendance) | `lib/llm/openai.ts:17,58` (SDK déjà instancié) |
| Transcription Deepgram | **CONFIG seulement** — var listée, **0 code** | `.env.example` (`DEEPGRAM_API_KEY`) ; grep = 0 |
| `create_lead`/`list_leads` (qualif à chaud) | **AVAILABLE persisté** | `lib/agent/tools/crm.ts:73,123` |
| `rea_tasks` entity_type `visit` (capture → tâche) | **AVAILABLE persisté** | `0043_..._002.sql:37` ; `api/tasks/route.ts` |
| Moteur estimation / comparables DVF (mode terrain) | **AVAILABLE (réutilisation)** | `lib/estimation/` (brief §AVAILABLE) |
| Brouillon email vendeur / relance | **COUVERT Opus 05 #4 + rail `contact.ts`** — jonction, pas duplication | `opus-05.md` ; `lib/prospection/contact.ts` |
| Shell mobile responsive / bottom bar | **COUVERT M04-07** — j'ancre dedans, je ne le refais pas | `components/cockpit/BottomBar.tsx` |
| Signature électronique bon de visite | **NOUVELLE brique** (canvas tactile → image → PDF R2, 100 % navigateur) | pas de dépendance externe requise |

**Voie STT honnête (à annoncer telle quelle au produit) :**
- **Variante A — Web Speech API navigateur (0 dépendance, 0 clé, gratuit).** `webkitSpeechRecognition`
  transcrit en direct dans le champ ; qualité FR correcte sur Chrome/Edge/Safari desktop et mobile.
  Limites honnêtes : dispo variable selon navigateur (Firefox faible), pas de transcription d'un fichier
  déjà enregistré, dépend du micro live. **C'est le défaut recommandé : livrable immédiatement.**
- **Variante B — Whisper serveur via SDK `openai` existant (aucune nouvelle clé).** L'agent enregistre
  l'audio (`MediaRecorder`, natif) → upload R2 (patron photos) → `openai.audio.transcriptions.create()`
  côté serveur → texte. Plus robuste (fichier, offline-then-sync, tous navigateurs), **coût par minute**
  → à border par cost-guard (`paidCall`, déjà présent). Deepgram = **non retenu** (0 code, nouvelle dépendance
  pour un gain nul vs Whisper déjà atteignable).

---

## Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---|---|---|---|---|
| **Rechat — AI Memo** | Capture voix (live ou mémo dicté après coup) → **transcription + résumé STRUCTURÉ + next steps**, auto-lié aux contacts/transactions CRM ; couche coaching « Lucy Insight ». Lancé **avril 2026**, inclus sans surcoût. | rismedia.com/2026/04/08/rechat-launches-ai-memo… ; housingwire.com/articles/rechat-launches-ai-memo-tool-for-agents | 2026-07-18 | **Prouvé** (2 sources concordantes) |
| **Journal de l'Agence (FR)** | CR de visite = **6 champs fixes** : profil acquéreur, points positifs, freins, niveau d'intérêt, comparaison autres biens, next steps. **« envoyé dans les deux heures »** change la dynamique mandat ; **workflow dicté (voix) → IA → email vendeur en ~45 s** ; **mode supervisé (brouillon 2 semaines) puis auto** ; fiche de qualification acquéreur pré-visite générée du CRM. | journaldelagence.com/1411374-agents-immobiliers-apres-chaque-visite-un-compte-rendu… | 2026-07-18 | **Prouvé** (page lue en détail) |
| **SweepBright (mobile)** | « **dictate notes, property descriptions, or visit reports** directly in the mobile app » ; upload multi-images ; saisie terrain « hours → minutes ». | play.google.com/store/apps/details?id=com.sweepbright ; therealestatevoice.com.au/sweepbright | 2026-07-18 | **Prouvé** (dictée + upload) / Inféré (structuration) |
| **Hektor (FR) — Hektor Voice** | Assistant IA vocal : création de bien, gestion contacts, **rédaction d'emails**, questions juridiques ; **app terrain hors-ligne** (saisie sans réseau, sync au retour). | la-boite-immo.com/logiciel-immobilier/application-mobile ; av-transaction.immo/blog/…comparatif-logiciel-immobilier | 2026-07-18 | **Prouvé** (voix + offline) |
| **Follow Up Boss (mobile)** | Appels/SMS/notes **entre deux visites** ; voir la fiche du bien pendant l'appel ; voice AI + voicemail drop ; tout construit autour de la **rapidité de suivi post-visite**. | followupboss.com/features/mobile-apps ; followupboss.com/features/texting | 2026-07-18 | **Prouvé** (suivi post-visite mobile) |
| **NAR app — Buyer Tour** | Créer une liste de biens, **ajouter notes + photos à chaque étape**, partager le résumé ; rapports pré-téléchargés en PDF **accessibles hors réseau**. | theclose.com/real-estate-apps ; housingwire.com/articles/real-estate-apps | 2026-07-18 | **Prouvé** (notes/photos par étape + offline) |
| **Curb Hero** | Sign-in open house / **capture visiteur** par QR ou formulaire, **hors-ligne** (sync au retour), intégré à 6000+ CRM ; 100 % gratuit solo. | curbhe.ro ; capterra.com/p/201137 | 2026-07-18 | **Prouvé** (feuille de présence digitale) |
| **Signature électronique FR (bon de visite)** | Le **bon de visite se signe électroniquement sur tablette/smartphone en face-à-face** ; couvre EDL, mandats, compromis ; versions PDF remplissables pour saisie mobile. | sphere-immo.com/blog/signature-electronique ; infodiagnostiqueur.com/bon-de-visite-immobilier-pdf | 2026-07-18 | **Prouvé** (signature tactile mobile) |
| **La Boîte Immo — Virtual Visit** | App de visite historique **évoluant avec l'IA + design repensé** (2026). | la-boite-immo.com/actualites/virtual-visit-lapplication-incontournable… | 2026-07-18 | **Prouvé** (existence + virage IA) / Inféré (détail features) |
| **Saleswise** | CMA client-ready en **~30 s** sur mobile (comps live) — référence « valo terrain instantanée ». | saleswise.ai/blog/best-apps-for-real-estate-agents | 2026-07-18 | **Prouvé** (CMA rapide) |

**Lecture concurrentielle marquante :** la capture vocale de visite → CR structuré → CRM est passée de
« nice-to-have » à **standard 2026** : Rechat l'a lancée en avril 2026 **incluse sans surcoût**, SweepBright
et Hektor la mettent en avant, et côté FR la norme métier (Journal de l'Agence) chiffre l'attente vendeur
(**CR sous 2 h**) et décrit exactement le workflow **voix → IA → brouillon → auto**. Azigo a le
**backend déjà écrit** (`visits.feedback` + PATCH) — c'est le seul concurrent où le rattrapage est une
UI de 3-5 jours, pas un chantier data.

---

## Candidats

### Candidat 1 — Débrief vocal de visite → CR structuré (voix → texte → `visits.feedback`)

- **Nom court :** Débrief vocal de visite.
- **Problème métier exact :** après une visite, l'agent est en voiture/sur le trottoir ; taper un compte
  rendu propre est pénible, donc il ne le fait pas → le vendeur reste dans le silence (que « il interprète
  toujours dans le mauvais sens », Journal de l'Agence) et doute du mandat. Le champ existe mais reste vide.
- **Utilisateur concerné :** agent négociateur, en mobilité, immédiatement après la visite.
- **Moment du parcours :** T+0 à T+30 min après la visite, sur mobile (ou desktop au retour).
- **Écran / emplacement précis :** **NOUVELLE fiche `/visits/[id]`** (aujourd'hui inexistante) — bloc
  « Compte rendu » avec bouton micro. Accès depuis la ligne de `/visits/page.tsx` (rendre la ligne cliquable)
  et depuis le rappel post-visite de l'accueil (M04-08). Pas de nouveau menu top-level.
- **Comportement du widget :** un bouton « Dicter le compte rendu » démarre la reconnaissance vocale
  (Variante A, `webkitSpeechRecognition`) ; le texte s'écrit en direct dans une zone éditable. Un bouton
  « Structurer » (optionnel) envoie le brut à l'assistant Cockpit avec un prompt de mise en forme sur les
  **6 champs FR** (profil / points + / freins / intérêt / comparaison / next step). L'agent relit, corrige.
- **Action disponible :** « Enregistrer le compte rendu » → `PATCH /api/visits/[id]` `{ feedback }`
  (route **déjà** prête) + bascule optionnelle `status:'realisee'`.
- **Automatisation éventuelle :** après enregistrement, proposition « Préparer le brouillon vendeur »
  qui **passe la main au candidat #4 d'Opus 05** (transformation en email brouillon). Je m'arrête au CR
  structuré ; **lui** rédige/route l'email. Aucune structuration/relance dupliquée.
- **Étape de validation humaine :** l'agent édite et valide le CR avant enregistrement ; le brouillon
  vendeur (Opus 05) reste `draft`, jamais envoyé sans `confirmed`.
- **Données nécessaires :** texte du CR, `visit_id`, `status`.
- **Données DÉJÀ dispo (vérifiées) :** `visits.feedback` (`0008_crm.sql:90`), `PATCH …feedback`
  (`api/visits/[id]/route.ts:46`), SDK `openai` pour la Variante B (`lib/llm/openai.ts:58`), assistant
  Cockpit pour la structuration (`lib/agent/run.ts`).
- **Données manquantes :** aucune côté data. Côté client : composant micro (Web Speech API) à écrire.
- **Routes/tables/composants concernés :** `app/(dashboard)/visits/[id]/page.tsx` (NOUVEAU),
  `_components/VisitDebrief.tsx` (NOUVEAU), `api/visits/[id]` (existe), option route
  `api/visits/[id]/transcribe` (NOUVELLE, Variante B Whisper).
- **Dépendances externes :** **aucune** en Variante A (navigateur). Variante B : OpenAI Whisper **avec la
  clé existante** (coût plafonné par `paidCall`).
- **Taille estimée :** **M (3-5 j)** — fiche `/visits/[id]` + bloc micro + prompt de structuration
  (Variante A). +1-2 j si Variante B (upload audio R2 + route Whisper).
- **Risques :** dispo Web Speech variable selon navigateur (mitigation : fallback saisie manuelle, toujours
  éditable) ; structuration LLM à cadrer (données métier non fiables = pas d'action auto). Faible.
- **Preuve concurrentielle :** Rechat AI Memo (avril 2026, voix→résumé structuré→CRM) ; SweepBright (dictée
  de visit reports) ; Journal de l'Agence (workflow voix→IA→vendeur, 6 champs).
- **Scénario de démo :** ouvrir une visite passée sur mobile → appuyer micro → dire « acheteur couple 35 ans,
  a adoré la luminosité, freiné par la cuisine à refaire, budget ok jusqu'à 340k, compare avec un T3 rue
  Voltaire, à relancer sous 3 jours » → « Structurer » → 6 champs propres → Enregistrer → `feedback` en base
  → bouton « Brouillon vendeur » (main à Opus 05).
- **Indicateur de succès :** % de visites `realisee` ayant un `feedback` non vide (cible > 60 % sous 30 j),
  délai médian visite → CR enregistré.
- **Décompte /100 :** impact business **23**/25 (sécurise le mandat, attente vendeur chiffrée) · utilité
  quotidienne **19**/20 (chaque visite) · effet démontrable **14**/15 (démo voix→base spectaculaire) ·
  avantage agentique **13**/15 (structuration LLM + jonction gateway) · faisabilité **13**/15 (backend prêt,
  UI à créer) · dispo données **10**/10. Pénalités : 0. **= 89.**

### Candidat 2 — Fiche visite terrain : checklist + photos + statut « réalisée » en un écran

- **Nom court :** Fiche visite terrain.
- **Problème métier exact :** une visite est aujourd'hui une **ligne morte** (`/visits/page.tsx` : date,
  durée, statut, supprimer). Sur place l'agent n'a nulle part où dérouler la visite (points à montrer),
  attacher des photos prises pendant, ni acter proprement « réalisée » — donc l'info se perd ou finit sur WhatsApp.
- **Utilisateur concerné :** agent, pendant/juste après la visite, sur mobile.
- **Moment du parcours :** pendant la visite (checklist) et à la fin (photos + statut).
- **Écran / emplacement précis :** **NOUVELLE fiche `/visits/[id]`** (mutualisée avec candidat 1) — sections
  « Déroulé » (checklist), « Photos de la visite », « Statut ». Ligne de `/visits/page.tsx` rendue cliquable.
- **Comportement du widget :** checklist de points cochables (defaults : pièces vues, extérieur, diagnostics
  montrés, questions du visiteur) ; galerie photos avec bouton « Ajouter une photo » (input `capture=environment`
  → caméra du téléphone) ; sélecteur de statut réutilisant `StatusSelect`.
- **Action disponible :** upload photo (nouvelle route calquée sur photos bien) ; `PATCH …status` ;
  la checklist se sérialise dans `visits.notes` (ou champ jsonb dédié — voir données manquantes).
- **Automatisation éventuelle :** au passage `status:'realisee'`, l'accueil (M04-08) propose le rappel CR
  + qualif (candidats 1 et 3). Pas de communication auto.
- **Étape de validation humaine :** tout est saisi/validé par l'agent ; aucune donnée sortante.
- **Données nécessaires :** photos (bytes), statut, items de checklist.
- **Données DÉJÀ dispo :** R2 (`lib/storage/r2.ts`), patron upload complet
  (`api/properties/[id]/photos/route.ts`), `visits.status`/`visits.notes` (`0008_crm.sql`),
  `StatusSelect` (`components/cockpit/StatusSelect.tsx`).
- **Données manquantes :** une **table `visit_photos`** (calque exact de `property_photos`, migration ~1 fichier)
  OU réutiliser `property_photos` taggées ; idéalement une colonne `visits.checklist jsonb` (sinon sérialiser
  dans `notes`). Additif mineur, aucune refonte.
- **Routes/tables/composants concernés :** `visits/[id]/page.tsx` (NOUVEAU), `api/visits/[id]/photos` (NOUVEAU,
  calque photos), migration `visit_photos` + index FK (convention repo), `VisitChecklist.tsx` (NOUVEAU).
- **Dépendances externes :** aucune (R2 déjà là).
- **Taille estimée :** **M (3-5 j)** (fiche partagée avec candidat 1 amortit le coût).
- **Risques :** heic iOS (déjà géré côté MIME `api/properties/[id]/photos:91`) ; volume photos (rate-limit
  déjà en place). Faible.
- **Preuve concurrentielle :** NAR Buyer Tour (notes+photos par étape, offline) ; SweepBright (upload
  multi-images terrain) ; PIVOT / applications de visite FR (checklist + photos + rapport PDF).
- **Scénario de démo :** sur mobile, ouvrir la visite du jour → cocher le déroulé → « Ajouter une photo »
  (caméra) ×3 → statut « réalisée » → tout est rattaché à la visite et au bien.
- **Indicateur de succès :** % de visites `realisee` avec ≥1 photo ; adoption de la checklist.
- **Décompte /100 :** impact **20**/25 · utilité **18**/20 · démontrable **14**/15 (caméra live = effet
  fort) · agentique **9**/15 (peu d'IA, surtout capture) · faisabilité **13**/15 (patron d'upload prêt) ·
  données **10**/10. Pénalité **−0** (l'additif `visit_photos` reste mineur, pas « nouvelle infra »). **= 84.**

### Candidat 3 — Qualif acquéreur à chaud post-visite (chaud/tiède/froid → lead mis à jour)

- **Nom court :** Qualif à chaud.
- **Problème métier exact :** l'impression sur l'acheteur (chaud ? budget réel ? frein ?) est la plus fraîche
  juste après la visite et **s'évapore en heures**. Faute d'un geste rapide, le `status` du lead et son budget
  ne bougent jamais → un prospect chaud refroidit et repart chez un autre agent.
- **Utilisateur concerné :** agent, T+0 à T+15 min après la visite, mobile.
- **Moment du parcours :** juste après la visite, avant le RDV suivant.
- **Écran / emplacement précis :** panneau « Qualifier l'acheteur » dans la fiche `/visits/[id]` (si la
  visite a un `lead_id`) ; miroir en lecture sur `/leads/[id]`. Pas de nouveau menu.
- **Comportement du widget :** 3 gros boutons **Chaud / Tiède / Froid** + 2 champs express (budget confirmé,
  frein principal) + case « visite réalisée ». Mapping explicite : Chaud→`status:'offre'` proposé ou
  `qualifie` ; Tiède→`qualifie` ; Froid→note seulement. L'agent confirme le mapping (jamais silencieux).
- **Action disponible :** `PATCH /api/leads/[id]` `{ status, budget_min/max, notes }` (route CRM existante,
  owner-check) — ou via l'assistant (`create_lead`/update). Le frein alimente le CR (candidat 1) et le
  brouillon vendeur (Opus 05).
- **Automatisation éventuelle :** si Chaud, l'accueil (M04-08) crée une `rea_tasks` `kind:'relance'` `due J+2`
  — **tâche tracée, pas d'envoi**. Le message éventuel = rail Opus 05.
- **Étape de validation humaine :** l'agent choisit et confirme le nouveau statut ; rien ne part vers le client.
- **Données nécessaires :** `lead_id`, statut, budget, note frein.
- **Données DÉJÀ dispo :** `leads.status`/`budget_min`/`budget_max`/`notes` (`0008_crm.sql:44-66`),
  `visits.lead_id` (rattachement, `api/visits/[id]/route.ts:67`), `rea_tasks` `kind:'relance'` (`0043`).
- **Données manquantes :** rien (un champ « température » explicite serait un plus cosmétique, mappable sur `status`).
- **Routes/tables/composants concernés :** `visits/[id]/page.tsx` (panneau), `api/leads/[id]` (existe),
  `BuyerHotChip.tsx` (NOUVEAU).
- **Dépendances externes :** aucune.
- **Taille estimée :** **S (1-2 j)** (greffe sur la fiche des candidats 1/2).
- **Risques :** ne pas sur-automatiser le passage de statut (mitigation : proposition + confirmation).
  RGPD : purement interne (aucun contact), aucun risque `prosp_optout`. Faible.
- **Preuve concurrentielle :** Journal de l'Agence (niveau d'intérêt = champ du CR ; fiche de qualification
  acquéreur) ; Follow Up Boss (suivi immédiat post-visite mobile) ; Rechat (next steps par conversation).
- **Scénario de démo :** fin de visite → « Chaud », budget 340k, frein « cuisine » → le lead passe `qualifie`,
  une tâche de relance J+2 apparaît à l'accueil.
- **Indicateur de succès :** % de leads liés à une visite dont le `status` évolue dans les 24 h post-visite.
- **Décompte /100 :** impact **21**/25 (conversion acheteur chaud) · utilité **18**/20 · démontrable **12**/15 ·
  agentique **11**/15 (tâche dérivée + jonction) · faisabilité **13**/15 · données **10**/10.
  Pénalité **−3** (chevauche l'accueil M04-08 sur la dérivation de tâche → je borne au geste de qualif, la
  tâche reste côté M04). **= 82.**

### Candidat 4 — Bon de visite / feuille de présence signable sur mobile (signature tactile → PDF R2)

- **Nom court :** Bon de visite signable.
- **Problème métier exact :** le **bon de visite** (norme FR) protège la commission de l'agent en prouvant que
  c'est LUI qui a fait visiter. Aujourd'hui c'est du papier ou rien ; le geste digital manque. En pratique
  la signature électronique du bon de visite sur smartphone est **déjà admise** (sphere-immo, infodiagnostiqueur).
- **Utilisateur concerné :** agent + visiteur, sur place, en fin de visite.
- **Moment du parcours :** à la porte, fin de visite.
- **Écran / emplacement précis :** action « Bon de visite » dans la fiche `/visits/[id]` → écran plein
  signature. PDF stocké sur le bien (R2). Pas de nouveau menu.
- **Comportement du widget :** pré-remplit bien + date + agent depuis la visite ; le visiteur saisit son nom
  et **signe au doigt** (canvas HTML tactile) ; l'agent signe aussi. « Générer le bon » → PDF horodaté.
- **Action disponible :** upload PDF sur R2 (patron existant), row lié à la visite ; téléchargement/lien.
- **Automatisation éventuelle :** proposer d'attacher le bon au CR / à la fiche bien. Aucun envoi auto.
- **Étape de validation humaine :** double signature explicite (visiteur + agent). Consentement de fait.
- **Données nécessaires :** nom visiteur, signatures (images), bien, date, agent.
- **Données DÉJÀ dispo :** R2 (`lib/storage/r2.ts`), génération PDF déjà pratiquée
  (`api/estimations/[id]/pdf/route.ts`, `api/brochure/[token]/pdf/route.ts`), `visits`/`properties`.
- **Données manquantes :** table `visit_documents` (ou réutiliser un préfixe R2 + `visits.notes` pour l'URL) ;
  un composant signature (canvas natif, **aucune** dépendance externe requise).
- **Routes/tables/composants concernés :** `visits/[id]/page.tsx` (action), `api/visits/[id]/bon-visite`
  (NOUVEAU, génère PDF → R2), `SignaturePad.tsx` (NOUVEAU, canvas).
- **Dépendances externes :** aucune (canvas + lib PDF déjà dans le repo).
- **Taille estimée :** **M (3-5 j)** (canvas signature + mise en page PDF + stockage).
- **Risques :** valeur juridique de la signature « simple » (le bon de visite ne l'exige pas au niveau
  qualifié ; on reste sur signature simple horodatée, comme les concurrents). Modéré-faible.
- **Preuve concurrentielle :** signature électronique bon de visite sur mobile admise (sphere-immo,
  infodiagnostiqueur, immo-sign) ; Curb Hero (feuille de présence digitale open house, offline).
- **Scénario de démo :** fin de visite → « Bon de visite » → visiteur signe au doigt → PDF horodaté rangé
  sur le bien, consultable plus tard.
- **Indicateur de succès :** nombre de bons de visite signés/mois ; % de visites `realisee` avec bon attaché.
- **Décompte /100 :** impact **19**/25 (protège la commission) · utilité **15**/20 (pas toutes les visites) ·
  démontrable **13**/15 (signature au doigt = effet fort) · agentique **6**/15 (peu d'IA) · faisabilité
  **12**/15 · données **8**/10 (petite table/route à ajouter). Pénalité **−5** (additif table+route PDF).
  **= 78.**

### Candidat 5 — Mode terrain « à côté de ce bien » : comparables + fiche hors-ligne-friendly

- **Nom court :** Mode terrain bien.
- **Problème métier exact :** en RDV vendeur ou en visite, l'agent a besoin **tout de suite** du prix, des
  comparables DVF et des chiffres du bien pour argumenter ; aujourd'hui il faut naviguer/chercher. Les
  concurrents US (NAR, Saleswise) sortent la CMA en 30 s sur mobile.
- **Utilisateur concerné :** agent en RDV/visite, mobile.
- **Moment du parcours :** pendant l'entretien vendeur ou la visite.
- **Écran / emplacement précis :** bouton « Mode terrain » sur `/properties/[id]` (et raccourci accueil) →
  vue condensée mobile : prix, fourchette d'estimation, top comparables DVF, DPE. Réutilise l'existant.
- **Comportement du widget :** synthèse mobile en cartes (surface, prix demandé, estimation, 3 comparables,
  DPE), boutons d'appel/itinéraire. Pré-chargement pour tolérer une connexion faible.
- **Action disponible :** consultation + « Créer une visite » / « Créer un lead » depuis la vue (tools existants).
- **Automatisation éventuelle :** aucune écriture auto ; pure lecture + raccourcis.
- **Étape de validation humaine :** N/A (lecture).
- **Données nécessaires :** données bien + estimation liée + comparables.
- **Données DÉJÀ dispo :** moteur estimation/comparables DVF (`lib/estimation/`, brief §AVAILABLE),
  `properties`/`estimations` (lien 0039), photos R2. Tout est déjà en base.
- **Données manquantes :** vrai offline (service worker) = hors périmètre ; ici « tolérant réseau faible »
  (pré-fetch), pas de PWA lourde.
- **Routes/tables/composants concernés :** `properties/[id]` (vue terrain), composant `FieldMode.tsx` (NOUVEAU),
  réutilise routes estimation/comparables existantes.
- **Dépendances externes :** aucune.
- **Taille estimée :** **S (1-2 j)** (surtout de la composition d'existant).
- **Risques :** ne pas confondre avec M04-10 (estimation mobile) : ici c'est une **vue de consultation
  terrain d'un bien au portefeuille**, pas le wizard d'estimation. Frontière à tenir.
- **Preuve concurrentielle :** NAR (subject property + comps pré-téléchargés offline) ; Saleswise (CMA ~30 s
  mobile) ; PropStream (comparables terrain).
- **Scénario de démo :** devant l'immeuble → « Mode terrain » → prix + 3 comparables DVF + DPE en une vue.
- **Indicateur de succès :** ouvertures du mode terrain / RDV ; temps d'accès à un comparable.
- **Décompte /100 :** impact **17**/25 · utilité **16**/20 · démontrable **12**/15 · agentique **8**/15 ·
  faisabilité **13**/15 · données **10**/10. Pénalité **−2** (frontière fine avec M04-10, bornée à la
  consultation). **= 74.**

### Candidat 6 — Capture éclair depuis la bottom bar (bouton « + » : note vocale / photo → `rea_tasks`)

- **Nom court :** Capture éclair.
- **Problème métier exact :** une idée surgit en marchant (« rappeler M. Durand », « photographier cette
  façade ») ; sans capture instantanée, elle se perd entre deux RDV. L'app n'a pas de geste « inbox rapide ».
- **Utilisateur concerné :** agent en déplacement, mobile.
- **Moment du parcours :** n'importe quand hors d'un écran précis (dans la rue, l'ascenseur).
- **Écran / emplacement précis :** **bouton « + » central dans `BottomBar.tsx`** (composant mobile existant).
  Ouvre une feuille : « Note vocale » (Web Speech) / « Photo » (caméra) / « Texte ».
- **Comportement du widget :** dicter/photographier/écrire → crée une `rea_tasks` (`entity_type` selon
  contexte ou `'general'`, `kind:'note'`, `title` = transcription courte). La photo va sur R2 (patron existant),
  l'URL dans `notes`.
- **Action disponible :** création `rea_tasks` via `api/tasks` (existe) ; la tâche apparaît à l'accueil (M04-08).
- **Automatisation éventuelle :** l'assistant peut proposer de rattacher la tâche à un lead/bien deviné (lecture
  seule, jamais d'écriture sensible auto).
- **Étape de validation humaine :** l'agent voit et édite la tâche créée ; rien ne sort de l'app.
- **Données nécessaires :** texte/photo, type d'entité optionnel.
- **Données DÉJÀ dispo :** `rea_tasks` `kind:'note'`/`entity_type:'general'` (`0043`), `api/tasks/route.ts`,
  R2, `BottomBar.tsx`.
- **Données manquantes :** aucune.
- **Routes/tables/composants concernés :** `components/cockpit/BottomBar.tsx` (bouton), `QuickCaptureSheet.tsx`
  (NOUVEAU), `api/tasks` (existe), `api/tasks/photos` (NOUVEAU si photo, calque photos).
- **Dépendances externes :** aucune (Web Speech + caméra natifs).
- **Taille estimée :** **S (1-2 j)**.
- **Risques :** frontière avec M04-07 (shell/bottom bar) : je n'AJOUTE qu'un bouton + une feuille, je ne
  refonds pas le shell. À citer. Faible.
- **Preuve concurrentielle :** Follow Up Boss (notes rapides mobile entre visites) ; NAR Buyer Tour (notes+photos
  à la volée) ; Hektor Voice (création rapide vocale terrain).
- **Scénario de démo :** dans la rue → « + » → dicter « rappeler propriétaire du 12 rue Voltaire pour le prix »
  → tâche créée, visible à l'accueil.
- **Indicateur de succès :** captures/semaine ; % de captures converties en action.
- **Décompte /100 :** impact **15**/25 · utilité **17**/20 · démontrable **12**/15 · agentique **9**/15 ·
  faisabilité **13**/15 · données **10**/10. Pénalité **−4** (recouvre le shell M04-07 → borné à un bouton +
  feuille). **= 72.**

---

## Idées rejetées

- **Compte rendu structuré → brouillon d'email vendeur** — **possédé par Opus 05 (#4)**. Je fournis la capture
  vocale en amont (candidat 1), je ne refais pas la génération/routage du brouillon. Duplication évitée.
- **Partage du CR au vendeur / espace propriétaire** — **frontière Opus 09** (expérience côté client) et
  Opus 05 (#6, rapport de mandat partagé). Je produis le CR, eux le partagent.
- **Séquences de relance multi-étapes après visite** — **Opus 05 (#5)** (nurturing/cadence). Hors capture terrain.
- **App mobile native / PWA installable offline complète** — **contrainte dure brief : aucune app native** ;
  un service worker « offline complet » = infra majeure (**−20**). Retenu seulement en « tolérant réseau faible »
  (candidat 5), pas en PWA lourde.
- **Transcription Deepgram** — var listée mais **0 code** ; nouvelle dépendance/clé pour un gain **nul** vs
  Whisper déjà atteignable via le SDK `openai` existant. Éliminé par honnêteté (dépendance non câblée).
- **Visite virtuelle 3D / Matterport / capture caméra 360** — matériel + intégration externe absente du repo,
  **nouvelle intégration majeure** (−20), aucun MLS/Matterport câblé. Hors périmètre.
- **OCR/scan de pièces d'identité du visiteur à l'entrée** — risque **RGPD** fort (donnée sensible, consentement),
  aucune brique en place. Éliminé (−20 RGPD).
- **Itinéraire multi-visites optimisé (tournée du jour)** — chevauche **M04-08 (agenda/accueil)** et relève plus
  de l'agenda que de la capture ; pas de données de géoloc/route câblées → gain incertain. Écarté.
- **Coaching IA de l'agent façon « Lucy Insight » (Rechat)** — analyse de performance = gadget IA sans action
  concrète dans ce périmètre ; risque « chatbot sans action » (élimination brief). Écarté.
- **Feuille de présence open house multi-visiteurs (façon Curb Hero)** — le marché FR fonctionne surtout en
  visites individuelles avec bon de visite ; l'open house multi-visiteurs est marginal ici. Fondu dans le
  candidat 4 (bon de visite signable) plutôt qu'un module dédié.
- **Enregistrement audio intégral de la visite (transcription longue)** — consentement des deux parties +
  coût STT long + valeur floue vs débrief court dicté ; risque RGPD/consentement. Écarté au profit du débrief.
