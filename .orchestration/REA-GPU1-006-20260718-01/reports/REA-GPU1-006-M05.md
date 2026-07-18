# REA-GPU1-006-M05 — Prospection (hors gateway)

Commit `24fbc7a` sur `feature/rea-gpu1-native-006`. Migration client GPU1 natif (`getSupabaseAdmin`→`getGpu1Admin`).

## Delta réel

```
 .../prospection/annonces/[id]/estimate/route.ts    |   4 +-
 .../prospection/annonces/[id]/link-crm/route.ts    |   4 +-
 app/api/prospection/annonces/route.ts              |   4 +-
 app/api/prospection/contact/route.ts               |   8 +++-
 app/api/prospection/criteres/route.ts              |  51 +++++++++------------
 app/api/prospection/history/route.ts               |   4 +-
 app/api/prospection/ingest/route.ts                |   6 +--
 app/api/prospection/matchs/route.ts                |   8 ++--
 app/api/prospection/optout/route.ts                |   4 +-
 app/api/prospection/runs/route.ts                  |   4 +-
 app/api/prospection/scrape-custom/route.ts         |   4 +-
 lib/prospection/contact.ts                         |  10 ++--
 lib/prospection/criteres-update.ts                 |   2 +-
 lib/prospection/ingest.test.ts                     |   6 +--
 lib/prospection/ingest.ts                          | Bin 11528 -> 11481 bytes
 lib/prospection/mappers.ts                         |   2 +-
 lib/prospection/normalize.test.ts                  |   2 +-
 lib/prospection/scrape-custom.ts                   |   6 +--
 18 files changed, 63 insertions(+), 66 deletions(-)
```

> Rapport dérivé du delta git committé (source autoritative). Détail worker dans le journal d'orchestration.
