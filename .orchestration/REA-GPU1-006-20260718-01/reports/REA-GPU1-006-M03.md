# REA-GPU1-006-M03 — CRM (leads/properties/visits/mandates)

Commit `b6c7144` sur `feature/rea-gpu1-native-006`. Migration client GPU1 natif (`getSupabaseAdmin`→`getGpu1Admin`).

## Delta réel

```
 app/(dashboard)/leads/[id]/page.tsx                      |  4 ++--
 app/(dashboard)/leads/page.tsx                           |  4 ++--
 app/(dashboard)/mandates/[id]/page.tsx                   |  6 +++---
 app/(dashboard)/mandates/page.tsx                        |  6 +++---
 .../[id]/_components/PropertyPhotosSection.tsx           |  4 ++--
 .../[id]/_components/PropertyRelatedSection.tsx          |  4 ++--
 app/(dashboard)/properties/[id]/page.tsx                 |  4 ++--
 app/(dashboard)/properties/page.tsx                      |  4 ++--
 app/(dashboard)/visits/page.tsx                          |  6 +++---
 app/api/leads/[id]/enrich/route.ts                       | 10 +++++-----
 app/api/leads/[id]/route.ts                              | 16 ++++++++--------
 app/api/leads/route.ts                                   | 10 +++++-----
 app/api/mandates/[id]/route.ts                           | 16 ++++++++--------
 app/api/mandates/route.ts                                | 12 ++++++------
 app/api/properties/[id]/photos/[photoId]/route.ts        |  6 +++---
 app/api/properties/[id]/photos/route.ts                  | 10 +++++-----
 app/api/properties/[id]/route.ts                         | 16 ++++++++--------
 app/api/properties/route.ts                              | 10 +++++-----
 app/api/visits/[id]/route.ts                             | 16 ++++++++--------
 app/api/visits/route.ts                                  | 14 +++++++-------
 test/api-leads.test.ts                                   |  2 +-
 test/routes/properties-create.test.ts                    |  2 +-
 test/routes/properties-update.test.ts                    |  2 +-
 23 files changed, 92 insertions(+), 92 deletions(-)
```

> Rapport dérivé du delta git committé (source autoritative). Détail worker dans le journal d'orchestration.
