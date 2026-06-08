# Contrat de densité — Cockpit "Dense / Pro" (Linear-like)

> Source de vérité visuelle pour TOUS les modules. Tout agent qui propose une
> refonte d'UI doit s'y conformer. Densité cible : **Linear / Notion** — beaucoup
> d'info à l'écran, zéro espace mort, hiérarchie typo nette.
>
> RÈGLE ABSOLUE : aucune valeur en dur. Tout via tokens `--ct-*` (cf. `app/cockpit/00-tokens.css`).

## 1. Principes (non négociables)

1. **Densité d'abord.** Une card = l'info essentielle visible, le reste dans un menu ou au survol.
2. **Actions cachées par défaut.** Les boutons texte ("Modifier", "Supprimer", "Enrichir")
   NE sont JAMAIS affichés en permanence sur une card. Ils vivent dans un menu `⋯`
   (kebab) qui apparaît au `:hover` / `:focus-within` de la card.
3. **Une seule chose qui ressort par card.** Le nom (fort) OU le prix (accent), pas les deux au même poids.
4. **Pas de bordure inutile.** Les séparateurs lourds sont remplacés par espacement + fond.
5. **Le destructif n'est pas rouge en permanence.** "Supprimer" est neutre dans le menu,
   rouge seulement au survol de l'item.

## 2. Échelle de référence (tokens)

| Usage | Token | Valeur |
|---|---|---|
| Espace intra-card | `--ct-space-2xs` / `--ct-space-xs` | 4px / 8px |
| Espace entre cards | `--ct-space-xs` | 8px |
| Padding card | `--ct-space-sm` `--ct-space-md` | 10px / 16px |
| Radius card | `--ct-radius-lg` | 12px |
| Avatar dans liste | `--ct-avatar-sm` | 24px |
| Icône action (kebab) | `--ct-icon-sm` | 16px |
| Nom (titre card) | `--ct-fs-base` + `--ct-fw-bold` | 13px / 700 |
| Valeur secondaire (prix) | `--ct-fs-sm` | 12px |
| Méta / tag | `--ct-fs-2xs` + `--ct-text-muted` | 10px |

## 3. Hauteurs cibles

| Élément | Cible | Interdit |
|---|---|---|
| Card lead/bien (kanban) | **~64px** (2 lignes) | > 90px |
| Ligne liste (table) | **~40px** | > 56px |
| Colonne kanban (largeur) | `minmax(260px, 1fr)` → 4-5 visibles | colonnes fixes trop larges |
| Track funnel | 10px pill | barres épaisses 34px |

## 4. Anatomie d'une card lead "dense" (cible)

```
┌────────────────────────────────────┐
│ ●SE  Serge TEYSSERE            ⋯   │  ← avatar 24px + nom bold + kebab (hover)
│      345 000 € · Acheteur          │  ← prix accent + tag inline muted
└────────────────────────────────────┘
   padding: 10px 12px · gap: 4px · ~64px
```

- Ligne 1 : `avatar` + `nom` (flex:1, ellipsis) + `kebab` (opacity 0 → 1 au hover)
- Ligne 2 : `prix` (fw-semibold) + `·` + `tag` (badge 2xs muted), tout inline
- Le menu kebab ouvre : Modifier / Enrichir / Supprimer (Supprimer rouge au hover item)

## 5. Hiérarchie typo (du plus fort au plus faible)

1. Nom / titre → `--ct-text-primary` + `--ct-fw-bold` + `--ct-fs-base`
2. Valeur (prix) → `--ct-text-body` + `--ct-fw-semibold` + `--ct-fs-sm`
3. Méta / tag / count → `--ct-text-muted` + `--ct-fs-2xs`
4. Désactivé / fantôme → `--ct-text-faint`

## 6. États

- `:hover` card → `background: var(--ct-surface-2)` + `border-color: var(--ct-border-accent)` + kebab visible
- Drag → curseur grab, légère élévation (`--ct-shadow-depth`)
- Colonne vide → placeholder discret, pas de grosse zone vide

## 7. Ce qu'on bannit (vu sur le rendu actuel)

- ❌ 3 boutons texte empilés/flottants sur chaque card
- ❌ "Supprimer" rouge permanent
- ❌ Card de 130px pour 3 infos
- ❌ Badge "Acheteur" minuscule perdu en bas à gauche
- ❌ Espace mort vertical entre les lignes d'info
