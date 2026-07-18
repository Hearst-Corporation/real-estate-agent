# REA-GPU1-006-M06 — Agent-gateway + agents + jobs

Commit `37a0828` sur `feature/rea-gpu1-native-006`. Migration client GPU1 natif (`getSupabaseAdmin`→`getGpu1Admin`).

## Delta réel

```
 app/api/agent-gateway/v1/alerts/dispatch/route.ts  | 25 ++++++++++++++++---
 app/api/agent-gateway/v1/alerts/prepare/route.ts   | 27 +++++++++++++++++---
 .../agent-gateway/v1/buyers/get-profile/route.ts   |  4 +--
 app/api/agent-gateway/v1/buyers/list/route.ts      |  4 +--
 .../v1/buyers/update-preferences/route.ts          |  4 +--
 app/api/agent-gateway/v1/crm/create-lead/route.ts  |  4 +--
 .../agent-gateway/v1/crm/create-mandate/route.ts   |  4 +--
 .../agent-gateway/v1/crm/create-property/route.ts  |  4 +--
 app/api/agent-gateway/v1/crm/create-visit/route.ts |  6 ++---
 app/api/agent-gateway/v1/listings/collect/route.ts |  4 +--
 app/api/agent-gateway/v1/matching/compute/route.ts |  4 +--
 app/api/agent-gateway/v1/matching/persist/route.ts |  6 ++---
 app/api/agent-gateway/v1/valuations/get/route.ts   |  4 +--
 .../v1/valuations/update-interview/route.ts        |  6 ++---
 lib/agent-gateway/approval.test.ts                 | 18 +++++++-------
 lib/agent-gateway/approval.ts                      |  8 +++---
 lib/agent-gateway/audit.ts                         |  4 +--
 lib/agent-gateway/authz.test.ts                    |  8 +++---
 lib/agent-gateway/authz.ts                         |  8 +++---
 lib/agent-gateway/dispatch-route.test.ts           |  2 +-
 lib/agent-gateway/handler-timeout.test.ts          |  2 +-
 lib/agent-gateway/handler.ts                       |  4 +--
 lib/agent-gateway/idempotency.test.ts              |  2 +-
 lib/agent-gateway/idempotency.ts                   | 12 ++++-----
 lib/agent-gateway/idempotent-write-release.test.ts |  2 +-
 lib/agent-gateway/idempotent-write.ts              |  2 +-
 lib/agent-gateway/normalize-route.test.ts          |  2 +-
 lib/agent-gateway/read-route.test.ts               |  2 +-
 lib/agent-gateway/update-preferences-route.test.ts |  2 +-
 lib/agent/tools/crm.ts                             | 29 +++++++++++++++++++---
 lib/agent/tools/estimation.ts                      |  2 +-
 lib/agent/tools/gmail-estimation.ts                |  2 +-
 lib/agent/types.ts                                 |  8 +++---
 lib/jobs/inngest/functions.ts                      | 10 ++++----
 34 files changed, 149 insertions(+), 86 deletions(-)
```

> Rapport dérivé du delta git committé (source autoritative). Détail worker dans le journal d'orchestration.
