# Azigo (Cockpit)

Application de gestion immobilière de nouvelle génération, intégrant un CRM complet, un système d'estimations, de la prospection et des agents IA (Swarms).

## 🚀 Stack Technique

- **Framework** : Next.js 16 (App Router)
- **Base de données & Auth** : Supabase (PostgreSQL)
- **Design System** : Cockpit — **copie locale indépendante** (CSS natif, Glassmorphism, Thème sombre), éditable directement dans ce repo
- **Desktop** : Electron (build signé/notarisé)
- **IA** : Intégration Kimi K2.6 (Hypercli) pour le chat et l'assistance

## 📁 Architecture Principale

- `/app/(dashboard)` : Vues principales (CRM, Estimations, Prospection, Swarms, Agenda).
- `/components/cockpit` : composants du Design System (RailLeft, DataTable, Kanban, etc.).
- Navigation Cockpit : manifeste unique `config/nav.ts` pour le rail gauche, les onglets de page et la bottom bar mobile.
- Typographie Cockpit : échelle `--ct-fs-*` dans `app/cockpit/00-tokens.css` ; primitives `Title` (H1), `SectionTitle` (H2), `SubsectionTitle` (H3), `Caption` (meta), `PageHeader` + `PageStack` ; `PageSegmentTabs` pour onglets locaux ; `Card` avec `titleAs="section"` pour titres de fiche lisibles.
- `/docs` : Documentation technique et produit (voir `docs/produit/PROPOSITION_REFONTE_ECOLE.md` pour le plan de refonte actuel).
- `/lib` : Utilitaires, clients Supabase, et logique métier.

## 🎨 Design System — copie locale indépendante

Le design system **Cockpit vit entièrement dans ce repo** et lui appartient : il n'y a **aucune source centrale, aucune dépendance externe (pas de package `@hearst/cockpit-shell`, pas de tarball), aucune resync** à faire.

- **Composants** : `components/cockpit/*.tsx` — éditables directement.
- **Tokens & CSS** : `app/cockpit/*.css` (9 sections cascadées via `app/cockpit.css`), tokens `--ct-*` dans `app/cockpit/00-tokens.css` — éditables directement.
- **Catalog `<hearst-asset>`** : `public/cockpit-catalog/catalog/` (servi en local via `app/layout.tsx`) — enrichissable sur place.
- **Vocabulaire** : `components/cockpit/manifest.json` (auto-généré) → régénère après une modif CSS avec `npm run cockpit:manifest`.

Modifier le DS (composant, token, couleur, classe) se fait **ici, librement**. Un changement de token se reflète à chaud (HMR), sans rebuild de package. Seule règle : garder la cohérence visuelle interne du repo. Guide agent : [`components/cockpit/AGENTS.md`](components/cockpit/AGENTS.md).

## 🛠 Commandes Utiles

```bash
# Lancer le serveur de développement web (Port 3002)
npm run dev

# Lancer l'application Desktop (Electron + Next.js)
npm run electron:dev

# Build de production web
npm run build

# Build de l'application Desktop (.dmg)
npm run electron:build

# Linter le projet
npm run lint
```

## 📚 Documentation

Consultez le dossier `/docs` pour plus de détails sur l'orchestration du CRM, les smart contracts, et les audits UI/UX.
