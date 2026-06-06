# Proposition de Refonte : Projet École (Navigation, Visuel, Assets & Docs)

Suite à l'audit du projet "Real Estate Agent" (interface Cockpit), voici la proposition structurée en 7 axes pour améliorer la navigation, les visuels, la gestion des assets (données/datins) et la documentation.

## Audit Actuel

1. **Navigation** : Le système actuel utilise un `RailLeft` principal et un sous-menu `CrmTabs` pour la section CRM. Ce double niveau peut être confus et prend de la place verticalement sur les petits écrans. Sur mobile, le comportement responsive est basique.
2. **Visuel** : Le design system "Cockpit" (thème sombre, glassmorphism) est très dense. Certaines variables CSS portent à confusion (ex: `--ct-accent-maroon` qui est bleu). Il manque des micro-interactions pour rendre l'interface plus vivante.
3. **Assets & Données** : Les icônes sont hardcodées en SVG inline dans les composants. Il n'y a pas de structure claire pour les assets visuels (placeholders de biens, avatars des leads).
4. **Documentation (Dox)** : Le `README.md` est celui par défaut de Next.js. La documentation produit doit être mise à jour pour refléter l'architecture réelle.

---

## Plan d'Action en 7 Axes

### 1. Refonte de la Navigation Principale (`RailLeft` & `BottomBar`)
- **Objectif** : Simplifier l'accès aux modules CRM.
- **Action** : Transformer le `RailLeft` pour intégrer un menu accordéon ou un flyout pour le CRM, supprimant le besoin du `CrmTabs` permanent.
- **Fichiers** : `components/cockpit/RailLeft.tsx`, `components/cockpit/CrmTabs.tsx`, `app/cockpit.css`.

### 2. Amélioration Visuelle et UI/UX
- **Objectif** : Éclaircir l'interface et améliorer les contrastes.
- **Action** : Nettoyer les variables CSS dans `app/cockpit.css`. Ajouter des états `:hover` et `:focus-visible` plus marqués. Améliorer la lisibilité des grilles de données (DataTables et Kanban).
- **Fichiers** : `app/cockpit.css`, `components/cockpit/primitives.tsx`.

### 3. Gestion des Assets et "Datins" (Données)
- **Objectif** : Centraliser les ressources visuelles et les données statiques.
- **Action** : Créer un dossier `public/assets/` (avatars, placeholders immobiliers, icônes). Créer un composant unifié `<Icon />` pour remplacer les SVG inline.
- **Fichiers** : `components/cockpit/Icon.tsx`, `public/assets/*`.

### 4. Refonte du Module CRM (Leads & Properties)
- **Objectif** : Rendre la gestion des leads et des biens plus intuitive.
- **Action** : Améliorer le drag-and-drop visuel du Kanban (`.crm-kanban`). Intégrer les nouveaux assets (avatars) dans les cartes.
- **Fichiers** : `app/(dashboard)/leads/page.tsx`, `app/(dashboard)/properties/page.tsx`.

### 5. Optimisation Mobile (Responsive)
- **Objectif** : Une expérience parfaite sur smartphone.
- **Action** : Refondre la `BottomBar` pour qu'elle agisse comme une vraie tab bar mobile native.
- **Fichiers** : `app/cockpit.css`, `components/cockpit/BottomBar.tsx`.

### 6. Mise à jour de la Documentation ("Dox")
- **Objectif** : Avoir une source de vérité à jour.
- **Action** : Réécrire le `README.md` avec les commandes du projet, la stack (Next.js 16, Supabase, Electron), et l'architecture. Mettre à jour `docs/CRM_ORCHESTRATION.md`.
- **Fichiers** : `README.md`, `docs/produit/ARCHITECTURE.md`.

### 7. Tests, Linting et Polissage
- **Objectif** : Garantir la stabilité.
- **Action** : Exécuter le linter, corriger les erreurs TypeScript introduites, et vérifier le rendu sur différents navigateurs.
- **Fichiers** : Tous les fichiers modifiés.
