# Archive — rapports de vagues passées

Documents **historiques**, conservés pour la traçabilité (décisions prises, preuves,
chronologie). **Ils ne font pas foi sur l'état du produit** et peuvent décrire une
architecture morte (ex. Supabase, retiré depuis).

Source de vérité courante :

| Sujet | Document |
|---|---|
| Architecture, conventions, état production, intégrations | [`../../CLAUDE.md`](../../CLAUDE.md) |
| Déploiement, migrations, health, rollback | [`../DEPLOYMENT.md`](../DEPLOYMENT.md) |
| État réel du schéma sur GPU1 | [`../gpu1-activation-009.md`](../gpu1-activation-009.md) |
| Version livrée et limites | [`../RELEASE.md`](../RELEASE.md) |
| Preuves QA (captures + manifests) | [`../qa/`](../qa/) |

## Contenu

- `REA-PLATFORM-002-rapport.md` — ex-`LAST_REPORT.md` racine, vague REA-PLATFORM-002
  (parcours augmentés, migration 0043, frontière Aigent). Dépassé : voir son en-tête.
- `design-DENSITY-CONTRACT-legacy.md` — ex-`docs/design/DENSITY-CONTRACT.md`. S'appuie sur
  l'ancien DS CSS `--ct-*` / `app/cockpit/*.css`, **purgé**. DS actuel : [`../../DESIGN-SYSTEM.md`](../../DESIGN-SYSTEM.md).
