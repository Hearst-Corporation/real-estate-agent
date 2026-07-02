# Azigo (Cockpit)

Application de gestion immobilière de nouvelle génération, intégrant un CRM complet, un système d'estimations, de la prospection et des agents IA (Swarms).

## 🚀 Stack Technique

- **Framework** : Next.js 16 (App Router)
- **Base de données & Auth** : Supabase (PostgreSQL)
- **Design System** : Cockpit — **copie locale indépendante** en utilities Tailwind v4 (glassmorphism, thème sombre slate/indigo), éditable directement dans ce repo. Voir [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).
- **Desktop** : Electron (build signé/notarisé)
- **IA** : Intégration Kimi K2.6 (Hypercli) pour le chat et l'assistance

## 📁 Architecture Principale

- `/app/(dashboard)` : Vues principales (CRM, Estimations, Prospection, Swarms, Agenda, Invest).
- `/components/cockpit` : primitives et composants riches du Design System (`primitives.tsx`, `RailLeft`, `DataTable`, Kanban, etc.).
- Navigation Cockpit : manifeste unique `config/nav.ts` pour le rail gauche, les onglets de page et la bottom bar mobile.
- `/docs` : Documentation technique et produit (voir `docs/produit/PROPOSITION_REFONTE_ECOLE.md` pour le plan de refonte actuel).
- `/lib` : Utilitaires, clients Supabase, et logique métier.

## 🎨 Design System — copie locale, Tailwind utilities

Le design system **Cockpit vit entièrement dans ce repo** et lui appartient : aucune source centrale, aucune dépendance externe, aucune resync à faire. Référence complète : **[`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)** (tokens, thème, primitives, mapping écran → blocs).

- **Composants** : `components/cockpit/*.tsx` — éditables directement, composés en utilities Tailwind natives (pas de classes `ct-*` custom).
- **Thème** : `app/globals.css` (`@theme` Tailwind v4) — palette dark slate-950/indigo-400, glassmorphism.
- **Blocs UI** : bâtis à partir de la banque [Tailwind Plus UI Blocks](https://tailwindcss.com/plus) (`~/.claude/tailwind-blocks/`, 657 blocs React) restylés au thème du repo.

## Règles UI

**Interdit de coder de l'UI sans utiliser les composants.** Toute nouvelle page/écran/section se construit à partir des primitives du design system (`components/cockpit/primitives.tsx` — `PageStack`, `PageHeader`, `Card`, `KpiGrid`, etc.) et des blocs Tailwind Plus — jamais de markup ad-hoc qui réinvente un composant existant. Consulte `DESIGN-SYSTEM.md` avant d'ajouter un écran.

Le DS reste **libre** : composants, tokens et CSS s'éditent directement dans ce repo, sans verrou ni lint bloquant sur le design — c'est une référence de cohérence, pas une prison.

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
