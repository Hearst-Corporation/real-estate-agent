# Module Prospection — opérations & modes providers

Boucle commerciale : sources d'annonces → ingestion → déduplication → matching →
qualification → liaison CRM → estimation → contact protégé. DB = Postgres
self-host gpu1 (PostgREST). Voir aussi [DEPLOYMENT.md](DEPLOYMENT.md) et
[ESTIMATION.md](ESTIMATION.md).

## Architecture

```
Providers (Apify)  →  ingestion  →  dédup (hash_dedup)  →  prosp_annonces
                                                              │
critères acquéreur ─────────►  matching déterministe  ──►  prosp_matchs (score + recommandation)
                                                              │
                                            annonce → link-crm → lead + bien → estimation
                                                              │
                                            contact protégé (opt-out, anti-spam, confirmation humaine)
```

## Providers (matrice de vérité — vérifiée réseau)

| Provider | Rôle | Clé | Auth | État |
|---|---|---|---|---|
| **Apify** | ingestion annonces (LeBonCoin via actor) | `APIFY_TOKEN` + `APIFY_LISTINGS_ACTOR` | **200** | **seul opérationnel**. Token en header Bearer. |
| **MoteurImmo** | ingestion annonces | `MOTEURIMMO_API_KEY` | — | **mort** : clé absente ET host `api.moteurimmo.fr` = NXDOMAIN. Fail-soft (jamais appelé). |
| **Resend** | contact email | `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | 200 | opérationnel. Envoi seulement si `confirmed:true`. |
| **Twilio** | contact SMS/WhatsApp | `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`WHATSAPP_FROM` | — | **dry-run** (clés absentes) → jamais d'envoi, brouillon uniquement. |
| Custom scrape | recherche par critères | N/A | N/A | pas d'URL utilisateur → **pas de surface SSRF** ; params → body JSON Apify. |

**Mode dégradé** : un provider absent/en erreur ne casse jamais la consultation
des données déjà persistées. Apify absent → `[]`. MoteurImmo mort → jamais throw.

## Ingestion

`lib/prospection/ingest.ts` + route `POST /api/prospection/ingest` + job Inngest
`prospIngestion` (cron horaire).

- **Runs tracés** : chaque ingestion crée/met à jour `prosp_ingestion_runs`
  (provider, status, inserted/updated/duplicates/errors, started_at/ended_at).
  Consultables via `GET /api/prospection/runs`.
- **Idempotence** : header `Idempotency-Key` → `prosp_idempotency_keys` (replay
  de la réponse mémorisée, verrou unique anti-concurrence).
- **Déduplication** : `hash_dedup` (sha256 tronqué sur type|CP|surface/5|pièces|
  prix/5000) + `onConflict tenant_id,hash_dedup`. `duplicate_count` incrémenté.
- **Versioning prix** : à chaque changement de prix, archive dans
  `prosp_annonce_versions` avant écrasement (`prix_precedent`, `republication`,
  détection baisse). Identité stable = `source + source_id`.

## Matching & scoring (déterministe)

`lib/prospection/matching/match.ts`, `MATCH_ENGINE_VERSION = match@1.1.0`
persistée dans `prosp_matchs.engine_version`. Fonction pure, sans LLM.

- **Must-have** (échec → `rejected`/null) : type de bien, zone (préfixe CP/commune),
  budget min/max, surface min/max, pièces min, préférences `requis`/`exclu`
  (terrasse/parking/ascenseur/jardin/piscine), DPE max.
- **Score pondéré 0-100** : zone 40, budget 20, surface 15, pièces 10, type 10,
  confort (bonus cap +10). Champ essentiel manquant (prix/surface/pièces) →
  **plafond 60** (jamais `high_priority` à l'aveugle).
- **Recommandation** : `high_priority` (≥75) / `review` (≥50) / `low_priority` /
  `rejected`. Explicabilité : facteurs satisfaits / non-satisfaits / bloquants.
- **Comparaison estimation** (`valuationGap`) : écart prix annonce vs valeur
  estimée → `below_range` / `within_range` / `above_range` / `low_confidence`
  (estimation peu fiable → pas de conclusion) / `unavailable`.

## Liaison CRM

- `POST /api/prospection/annonces/[id]/link-crm` `{createLead, createProperty}` :
  crée ou rattache lead + bien depuis l'annonce (mapping `lib/prospection/crm-link.ts`,
  provenance `prospection`, champs présents uniquement). **Idempotent** (lead_id/
  property_id existant → pas de recréation). Ne jamais écraser une donnée CRM confirmée.
- `POST /api/prospection/annonces/[id]/estimate` : crée le bien à la volée si absent
  + lance l'estimation, comparaison prix (pending tant que le calcul async n'a pas
  tourné via `/api/estimations/[id]/value`).
- Liens bidirectionnels : `prosp_annonces.lead_id/property_id/estimation_id`.

## Contact & anti-spam

`lib/prospection/contact.ts` + `POST /api/prospection/contact`. Gardes fail-closed,
dans l'ordre : auth → idempotency → annonce active + ownership + `demarchage_bloque`
→ coordonnées → **opt-out** → template résolu (refus de toute variable `{{x}}`) →
anti-doublon récent → **confirmation humaine** → anti-spam → mode dégradé.

- **Aucun envoi automatique** : `confirmed:true` (humain) requis pour passer de
  `draft` à `approved`/`sent`. Un score de matching élevé ne déclenche jamais un envoi.
- **Mode dégradé** : provider non configuré (Twilio dry-run) → statut reste `draft`,
  **jamais `sent`**, message "copier manuellement, aucun envoi effectué".
- **États** : `draft` → `approved` → `sent`/`failed`/`replied`/`opted_out`,
  journalisés dans `prosp_contact_attempts` avec `idempotency_key` unique (anti-double-envoi).
- **Limites** : cap par `tenant:user:canal:jour` (`PROSP_CONTACT_CAP_PER_DAY`, défaut 30),
  fenêtre anti-doublon (`PROSP_CONTACT_DUP_WINDOW_SECONDS`, défaut 24h).

## Opt-out (RGPD démarchage)

`POST /api/prospection/optout` → `prosp_optout` (HASH SHA-256 email/téléphone,
jamais la PII en clair) + pose `demarchage_bloque` / `opt_out_at` sur l'annonce.
`isOptedOut` (fail-closed) consulté avant tout contact.

## Sécurité

- Toutes les routes : auth 401 fail-closed, ownership `user_id`+`tenant_id`
  (annonces = tenant-wide par design), validation Zod, pas de fuite `error.message`.
- `safe-fetch.ts` (estimation) : allowlist stricte d'hôtes gouv + garde de
  protocole explicite (http/https) + refus de redirection.

## Migrations (additives, appliquées sur gpu1 après backup pg_dump)

- `0040` : engine_version (matchs), prosp_annonce_versions, prosp_optout,
  prosp_contact_attempts, prosp_idempotency_keys, liens CRM sur annonces.
- `0041` : colonnes vendeur (email/téléphone/nom/type) sur annonces.
- `0042` : correctif — index opt-out/contact-idempotency en index COMPLETS
  (les index partiels cassaient `ON CONFLICT`, 42P10).

## Troubleshooting

- **Opt-out / contact renvoie 500 `42P10`** : index partiel → appliquer 0042.
- **Upsert annonce échoue 42703** : colonne fantôme — le schéma réel prime sur
  `database.types.ts` (vérifier via `psql` sur gpu1). Colonnes réelles :
  `source/titre/prix/surface/pieces/hash_dedup`, PAS `source_platform/surface_m2/title`.
- **0 annonce ingérée** : le cron Inngest n'a pas tourné, ou Apify non configuré.
  Lancer un run via `POST /api/prospection/ingest` ou le bouton scrapers.

## Limites connues

- MoteurImmo inutilisable (host mort + clé absente) — Apify est la seule source.
- Comparaison prix/estimation `pending` tant que le calcul d'estimation async
  n'a pas tourné (2 étapes : créer l'estimation, puis `/value`).
- Scoring mandat (`scoring/mandat.ts`) débranché (vit dans `prosp_prospects`,
  non alimenté par le job actuel).
