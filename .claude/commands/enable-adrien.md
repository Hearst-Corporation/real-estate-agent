---
description: "[Real estate Agent] Couche enablement agent. TIER=front-cockpit (+electron), RUNNER=npm, PORT=3002, GATE=npm run check."
---
Exécute le protocole global `~/.claude/commands/enable-adrien.md` sur Real estate Agent.

Variables pré-câblées (le hub global porte tout le protocole) :
- TIER = `front-cockpit` (overlay `electron`)
- RUNNER = `npm` · PORT = `3002`
- GATE_CMD = `npm run check` (lint:legal + lint:secrets + eslint + lint:nav + lint:strings + manifest --check + typecheck)
- Keystone = `config/nav.ts` (NEVER-OVERWRITE) · AGENTS.md = `components/cockpit/AGENTS.md`
- Strings = `lib/ui-strings.ts` (`UI.*`) · Scaffolder = `npm run new:feature <x>` · Baseline strings = `gate/strings-baseline.json`

Couche déjà appliquée (2026-06-07) : score 100/100. `scan`/`doctor` read-only ; `apply` idempotent.
