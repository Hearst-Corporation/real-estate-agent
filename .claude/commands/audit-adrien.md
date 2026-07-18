---
description: "[Real estate Agent] Audit unifié. Stack: Next.js 16 Electron. DB: Postgres GPU1 (PostgREST)."
argument-hint: "[sec|perf|qa|cleanup|deps|all]"
---
Exécute le protocole global `~/.claude/commands/audit-adrien.md` sur Real estate Agent (port 3002, npm). Focalisations : Next 16 → Server Actions/RSC/headers + proxy.ts ; DB GPU1 → RLS, jamais de token service-role côté client, filtrage user_id+tenant_id explicite ; Electron → IPC/contextIsolation/setWindowOpenHandler ; toujours → tokens `--ct-*`, `<think>` filter de la route chat.
