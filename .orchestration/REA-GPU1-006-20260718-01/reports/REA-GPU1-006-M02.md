# REA-GPU1-006-M02 — Auth / admin / audit / MFA

Commit `6493887`. Migration client GPU1 natif ; untypedAdmin -> Gpu1Client<unknown>. 401/403 avant DB, isolation cross-tenant audit-log, buildAdminOverview borné tenant.

```
 app/(dashboard)/admin/page.tsx      |  4 ++--
 app/api/admin/audit-log/route.ts    | 12 ++++++------
 app/api/admin/route.ts              |  4 ++--
 app/api/auth/login/route.ts         |  4 ++--
 app/api/auth/logout/route.ts        |  6 +++---
 lib/admin/overview.ts               |  5 ++---
 lib/server/audit-log.ts             | 10 +++++-----
 lib/server/auth-admin.test.ts       | 12 ++++++------
 lib/server/auth-admin.ts            | 10 +++++-----
 lib/server/auth.ts                  |  6 +++---
 lib/server/mfa-store.ts             | 10 +++++-----
 test/routes/admin-audit-log.test.ts |  8 ++++----
 test/routes/admin-mfa-reset.test.ts | 10 +++++-----
 13 files changed, 50 insertions(+), 51 deletions(-)
```
