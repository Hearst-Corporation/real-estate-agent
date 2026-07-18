# REA-GPU1-006-M04 — Estimation + brochure

Commit `a7a59fa` sur `feature/rea-gpu1-native-006`. Migration client GPU1 natif (`getSupabaseAdmin`→`getGpu1Admin`).

## Delta réel

```
 app/(dashboard)/estimations/[id]/page.tsx        |  4 ++--
 app/(dashboard)/estimations/page.tsx             |  4 ++--
 app/api/brochure/[token]/pdf/route.ts            |  6 +++---
 app/api/estimations/[id]/interview/route.ts      | 12 ++++++------
 app/api/estimations/[id]/mandate/route.ts        |  6 +++---
 app/api/estimations/[id]/market-context/route.ts |  6 +++---
 app/api/estimations/[id]/owner/route.ts          | 10 +++++-----
 app/api/estimations/[id]/pdf/prewarm/route.ts    |  6 +++---
 app/api/estimations/[id]/pdf/route.ts            |  6 +++---
 app/api/estimations/[id]/route.ts                |  6 +++---
 app/api/estimations/[id]/share/route.ts          |  6 +++---
 app/api/estimations/[id]/value/route.ts          |  8 ++++----
 app/api/estimations/route.ts                     | 10 +++++-----
 app/brochure/[token]/page.tsx                    |  4 ++--
 lib/brochure/generate.ts                         |  6 +++---
 lib/estimation/continuity.ts                     |  8 ++++----
 lib/estimation/owned.ts                          |  6 +++---
 17 files changed, 57 insertions(+), 57 deletions(-)
```

> Rapport dérivé du delta git committé (source autoritative). Détail worker dans le journal d'orchestration.
