# Modèle de données — Plateforme d'investissement immobilier tokenisé

> Domaine **data**. Schéma Postgres/Supabase multi-tenant avec RLS.
> Source juridique : [`docs/etude-immobilier-tokenise-2026.md`](../etude-immobilier-tokenise-2026.md).
> Migrations SQL réelles : [`06-migrations/0100`…`0105`](06-migrations/).
>
> **Statut de validation** : [FAIT] les 6 migrations ont été appliquées dans des
> transactions `BEGIN … ROLLBACK` sur le Postgres de production (ref
> `pyxhhkdjirqambhlpuqz`) — DDL, FK, CHECK, FK circulaire, RLS, triggers OK.
> Tests fonctionnels passés : chaîne de hash d'audit (+ isolation séquence par
> tenant), immuabilité `audit_log` (UPDATE/DELETE bloqués), `recompute_deal_raised`
> (les soft-commits ne comptent pas dans `raised_eur`).

---

## 1. Principes directeurs (et comment le schéma les force)

Le schéma **matérialise** les contraintes verrouillées de l'étude. Ce ne sont pas
des conventions : ce sont des **invariants structurels**.

| Contrainte étude | Traduction dans le schéma |
|---|---|
| **Pas de fonds / pas d'AIFM** | **Aucune** table `portfolio` / `fund` / `vault`. L'unité atomique est le `deal`, jamais un agrégat. |
| **1 SPV = 1 opération** | `deals.spv_id` porte une **contrainte `UNIQUE` (`uq_deal_spv`)**. Un SPV ne peut financer qu'un seul deal. |
| **Anti-FIA : pas de pré-collecte / pas de pooling** | `subscriptions` cible **toujours** une `bond_tranche` d'un `deal` précis. Le statut `reserved` = soft-commit **sans versement**. `recompute_deal_raised()` **n'additionne que** `funded/allocated/minted` → impossible d'afficher une collecte sans deal choisi. |
| **Obligations (créance), pas equity mutualisé** | L'instrument est `bond_tranches` (titre de créance). La cap table trace des **positions de créanciers**, pas des parts de fonds. |
| **Security token ERC-3643 en miroir du DEEP** | `bond_tranches.token_standard` CHECK ∈ {`ERC-3643`,`ERC-1400`} — **`ERC-4626` impossible**. `cap_table_entries` = registre **DEEP (source de vérité)** ; `token_mints` = **miroir on-chain** réconcilié (`reconciliation_status`, le DEEP prime). |
| **EUR séquestre par défaut, EURC/EURe en option** | `settlement_currency` CHECK ∈ {`EUR`,`EURC`,`EURe`} — **jamais USDT**. |
| **Plateforme ne détient jamais les fonds** | `escrow_movements.escrow_provider` CHECK ∈ {`notaire`,`carpa`,`emi`,`psp_segregated`} — **tiers obligatoire**, aucun compte plateforme. |
| **Marché secondaire = bulletin board (art. 25 ECSP)** | `secondary_orders` = **annonces sans appariement automatique**. `indicative_price_eur` (prix libre), `settled_via_token_mint_id` = rapprochement **déclaratif a posteriori**. Pas de carnet d'ordres apparié, pas de MTF. |
| **Piste d'audit immuable** | `audit_log` **append-only** (trigger bloque UPDATE/DELETE) + **chaînage par hash** par tenant. |
| **Multi-tenant RLS** | Toutes les tables : RLS activée, `tenant_id` + `current_tenant_id()`, owner via `(select auth.uid())`. Un index par FK. |

---

## 2. Diagramme entité-relation (ERD ASCII)

```
                                  ┌──────────────────┐
                                  │     tenants      │  PK id = tenant_id du JWT
                                  │ distribution_    │  (app_metadata.tenant_id)
                                  │   regime         │
                                  └─────────┬────────┘
            ┌───────────────┬───────────────┼───────────────┬──────────────┐
            │ tenant_id     │               │ tenant_id     │              │ tenant_id
            ▼               ▼               ▼               ▼              ▼
   ┌─────────────────┐  ┌────────────┐  (toutes les autres tables portent tenant_id)
   │ auth.users (FK) │  │ operators  │  opérateur immobilier (SAS MdB/promotion)
   └────────┬────────┘  └─────┬──────┘  objet commercial réel = pilier anti-FIA
            │ user_id         │ operator_id
            │                 │
            ▼                 ▼
   ┌──────────────────┐   ┌──────────────────────────────┐
   │ investor_profiles│   │            spvs              │  1 SAS dédiée
   │  classe ECSP     │   │ legal_form ∈ {SAS,SA}        │  (legal_form contraint :
   │  plafond, KYC,   │   │ dette senior + hypothèque    │   seules émettrices
   │  wallet+ONCHAINID│   │ ring-fencing                 │   de titres DEEP)
   └───┬─────────┬────┘   └──────────────┬───────────────┘
       │ 1       │ 1                      │ 1
       │         │                        │  spv_id  (UNIQUE → 1 SPV = 1 deal)
       │         │ N                       ▼
       │    ┌────▼─────────┐     ┌───────────────────────────────┐
       │    │ kyc_records  │     │            deals             │  unité de CHOIX
       │    │ (LCB-FT,     │     │ économie, levée, badges,     │  deal-by-deal
       │    │  Sumsub/     │     │ waterfall, offering_regime   │
       │    │  Onfido)     │     │ raised_eur (trigger)         │
       │    └──────────────┘     └──────┬─────────────┬──────────┘
       │                                │ 1 deal_id   │ deal_id
       │                                ▼             │
       │                    ┌─────────────────────┐   │
       │                    │   bond_tranches     │   │  OBLIGATION (créance)
       │                    │ seniority, coupon,  │   │  token ERC-3643 (jamais 4626)
       │                    │ lock_up, ERC-3643,  │   │  DEEP = source de vérité
       │                    │ deep_register_ref   │   │
       │                    └──────┬──────────────┘   │
       │ investor_profile_id       │ bond_tranche_id  │ deal_id
       │   ┌───────────────────────┴──────────────────┘
       ▼   ▼
   ┌────────────────────┐         ┌──────────────────────────┐
   │   subscriptions    │ 1───N   │    escrow_movements      │  miroir SÉQUESTRE TIERS
   │ reserved→signed→   │────────▶│ escrow_provider ∈        │  (notaire/carpa/emi)
   │ funded→allocated→  │ sub_id  │  {notaire,carpa,emi,...} │  plateforme ne détient
   │ minted             │         │ deposit/release/refund   │  JAMAIS les fonds
   └─────────┬──────────┘         └──────────────────────────┘
             │ subscription_id (issuance)
             ▼
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │   cap_table_entries      │◄───────▶│       token_mints        │
   │  REGISTRE DEEP           │ token_  │   MIROIR ON-CHAIN        │
   │  (SOURCE DE VÉRITÉ)      │ mint_id │   ERC-3643               │
   │  append-only, solde,     │◄────────│   mint/burn/transfer     │
   │  reconciliation_status   │ cap_    │   tx_hash, block         │
   │  (le DEEP prime)         │ entry_id│   compliance_checked     │
   └─────────┬────────────────┘         └────────────┬─────────────┘
             │ (positions par tranche/holder)         │ settled_via_token_mint_id
             │                                         │
             ▼                                         ▼
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │     distributions        │ 1───N   │    secondary_orders      │  BULLETIN BOARD
   │  coupon/principal/perf   │────────▶│  (art. 25 ECSP)          │  PAS de matching auto
   │  selon waterfall         │         │  buy/sell, prix indicatif│  PAS de MTF
   │  VARIABLE, non garanti   │         │  rapprochement déclaratif│
   └─────────┬────────────────┘         └──────────────────────────┘
             │ distribution_id
             ▼
   ┌──────────────────────────┐
   │  distribution_payouts    │  part par détenteur, prorata du solde à record_date
   │  brut - retenue = net    │  unique (distribution_id, holder_profile_id)
   └──────────────────────────┘

   ┌──────────────────────────┐         ┌──────────────────────────┐
   │       documents          │         │        audit_log         │  IMMUABLE
   │  GED polymorphe          │         │  append-only (trigger)   │  chaîne de hash
   │  (entity_type,entity_id) │         │  prev_hash → record_hash │  par tenant
   │  KIIS/DIS/contrats/IFU   │         │  seq monotone par tenant │  (toute altération
   │  clé object-store+sha256 │         │  append_audit_log()      │   casse la chaîne)
   └──────────────────────────┘         └──────────────────────────┘
   (polymorphe : référence n'importe quelle entité par (entity_type, entity_id))
```

---

## 3. Les 16 tables (+ 2 tables enfant) — référence

> Toutes les tables : `tenant_id text not null default 'real-estate-agent'`,
> `created_at`, RLS activée, **un index par FK**. `updated_at` + trigger
> `set_updated_at()` sauf registres append-only (`cap_table_entries`, `audit_log`).

### Socle — `0100_tokenisation_foundation.sql`

| Table | Rôle | Clés / contraintes notables |
|---|---|---|
| **tenants** | Racine multi-tenant. PK = `tenant_id` text du JWT. | `distribution_regime` ∈ {private_placement, psfp_partner, psfp_own}. Seed `real-estate-agent`. |
| **operators** | Opérateur immobilier (SAS MdB/promotion). Objet commercial réel = pilier anti-FIA. | `legal_form`, `activity_type`, `hoguet_card_t` (carte T seulement si entremise tiers), `siren` regex. |
| **investor_profiles** | 1 profil / (tenant,user). Gate « qui souscrit et combien ». | `uq_investor_profile_user`, `investor_class` ECSP, `annual_investment_cap_eur`, `wallet_address`+`onchainid_address` (regex EVM), `uq_investor_wallet`. |
| **kyc_records** | Historique KYC/AML (Sumsub/Onfido). Réfs + hash, **jamais de PII brute**. | `provider`, `level` (standard/enhanced=EDD), screening PEP/sanctions/chain, `risk_score` 0-100. |

### Opérations — `0101_deals_spvs_tranches.sql`

| Table | Rôle | Clés / contraintes notables |
|---|---|---|
| **spvs** | 1 SAS dédiée = 1 opération (ring-fencing). | `legal_form` ∈ {SAS,SA} (seules émettrices DEEP), dette senior + `mortgage_registered` + `intercreditor_signed`. |
| **deals** | Unité de choix deal-by-deal. Économie + levée + badges + waterfall. | **`uq_deal_spv` (1 SPV = 1 deal)**, `uq_deal_slug`, `offering_regime` ∈ {private_placement,ecsp,dis}, `settlement_currency` (jamais USDT), `raised_eur` (trigger), `chk_deal_window`. |
| **bond_tranches** | Tranche OBLIGATAIRE souscrite. Miroir ERC-3643 d'un registre DEEP. | `token_standard` ∈ {ERC-3643,ERC-1400} **(pas 4626)**, `seniority`, `nominal_unit_eur`, `chk_tranche_nominal_consistency`, `chk_units_issued_le_total`, `deep_register_ref`, `isin` regex. |

### Souscription & fonds — `0102_subscriptions_escrow.sql`

| Table | Rôle | Clés / contraintes notables |
|---|---|---|
| **subscriptions** | Engagement sur UNE tranche d'UN deal. | Statut `reserved→signed→funded→allocated→minted` (+ refunded/cancelled/withdrawn), `cooling_off_ends_at` (4j ECSP), `chk_subscription_amount`. |
| **escrow_movements** | Miroir comptable du **séquestre tiers**. | `escrow_provider` ∈ {notaire,carpa,emi,psp_segregated}, `direction`, `movement_type`, `travel_rule_ok`, `onchain_tx_hash` regex. |

> **Trigger `recompute_deal_raised()`** : maintient `deals.raised_eur` = somme des
> subscriptions `funded/allocated/minted`. **Exclut `reserved`/`signed`** (soft-commit
> sans versement). [FAIT] testé : 10000 (funded) + 3000 (minted) = 13000, 5000
> (reserved) ignoré.

### Cap table on/off-chain — `0103_cap_table_token_mints.sql`

| Table | Rôle | Clés / contraintes notables |
|---|---|---|
| **cap_table_entries** | **Registre légal DEEP = SOURCE DE VÉRITÉ.** Append-only. | `entry_type` (issuance/transfer_in/out/redemption/correction), `balance_units_after`, `reconciliation_status` (legal_only/synced/divergent/onchain_only), FK circulaire → `token_mints`. |
| **token_mints** | **Miroir on-chain ERC-3643.** | `operation` (mint/burn/transfer/forced_transfer/freeze/unfreeze), `tx_hash` regex, `uq_token_mint_onchain_event` (tx_hash, log_index), `cap_table_entry_id` (lien vers la vérité légale). |

> **Dualité on-chain/off-chain** : `cap_table_entries.token_mint_id` ↔
> `token_mints.cap_table_entry_id` (double lien). En cas de divergence,
> `reconciliation_status='divergent'` → **le DEEP prime** (régularisation on-chain).

### Distributions & secondaire — `0104_distributions_secondary.sql`

| Table | Rôle | Clés / contraintes notables |
|---|---|---|
| **distributions** | Événement de versement au niveau tranche. **Variable, non garanti.** | `distribution_type` (coupon/principal/.../final), `record_date`, `waterfall_rank`. |
| **distribution_payouts** *(enfant)* | Part d'un détenteur, prorata du solde à `record_date`. | `chk_payout_net` (net = brut - retenue), `uq_payout_distribution_holder`. |
| **secondary_orders** | **Bulletin board art. 25 ECSP.** Annonces sans appariement auto. | `side` (buy/sell), `indicative_price_eur` (libre), `settled_via_token_mint_id` (rapprochement **déclaratif a posteriori**, pas un matching de marché). |

### GED & audit — `0105_documents_audit_log.sql`

| Table | Rôle | Clés / contraintes notables |
|---|---|---|
| **documents** | GED **polymorphe** (KIIS/DIS, contrat d'émission, intercreditor, K-bis, IFU…). | `entity_type`+`entity_id`, `doc_type` (18 types), `content_sha256` (regex), `storage_key` (object-store, **jamais le binaire**), `visibility`. |
| **audit_log** | Piste d'audit **IMMUABLE** + chaînée. | `seq` monotone/tenant (`uq_audit_seq_tenant`), `prev_hash`→`record_hash`, triggers bloquant UPDATE/DELETE. Écriture **uniquement** via `append_audit_log()`. |

---

## 4. Modèle de la cap table on-chain / off-chain (détail)

C'est le cœur réglementaire-technique. Deux registres, **un seul fait foi**.

```
   ÉMISSION PRIMAIRE (au closing d'un deal)
   ────────────────────────────────────────
   subscription (status=allocated)
        │
        │  (1) inscription LÉGALE — fait foi
        ▼
   cap_table_entries  entry_type='issuance'
        balance_units_after = N
        deep_register_ref = 'DEEP-...'
        reconciliation_status = 'legal_only'   ← pas encore on-chain
        │
        │  (2) mint on-chain (miroir)
        ▼
   token_mints  operation='mint', status='confirmed', tx_hash='0x...'
        cap_table_entry_id ──► (pointe vers l'entrée légale source)
        │
        │  (3) réconciliation
        ▼
   cap_table_entries.token_mint_id ──► token_mints.id
   cap_table_entries.reconciliation_status = 'synced'   ← DEEP == on-chain
```

**Règles d'intégrité (appliquées côté service-role) :**
1. Une `cap_table_entries` peut exister **sans** `token_mint` (état `legal_only`) :
   le DEEP peut précéder l'on-chain. L'inverse (`onchain_only`) est une **anomalie**.
2. Toute opération `token_mints` de type `mint/burn/transfer` **doit** pointer
   vers une `cap_table_entry` (sa justification légale).
3. La **somme des `balance_units_after`** courants d'une tranche **doit** égaler
   `bond_tranches.units_issued` ET le total on-chain (`mint - burn`). Un job de
   réconciliation marque `divergent` les écarts → **le DEEP prime**.
4. Un transfert secondaire crée **deux** lignes `cap_table_entries`
   (`transfer_out` chez le cédant, `transfer_in` chez le cessionnaire) + une
   `token_mints` `operation='transfer'`, le tout **whitelisté** (KYC/ONCHAINID).

---

## 5. Piste d'audit immuable (détail)

```
   append_audit_log(tenant, action, ...)         [SEULE voie d'écriture]
        │
        │  pg_advisory_xact_lock(tenant)          ← sérialise la séquence
        ▼
   seq = max(seq par tenant) + 1
   prev_hash = record_hash de la ligne seq-1 (même tenant)   [NULL au genesis]
   record_hash = sha256( tenant | seq | action | entity_type
                         | entity_id | after_state | prev_hash )
        │
        ▼
   INSERT audit_log(...)            UPDATE / DELETE  ──► EXCEPTION (trigger)
```

[FAIT] Validé sur Postgres :
- `real-estate-agent` : seq 1 (genesis, prev_hash NULL) → seq 2 (`prev_hash` =
  `record_hash` de seq 1) → **chaîne OK**.
- `t2` : séquence **indépendante** repartant à 1 → **isolation par tenant**.
- UPDATE et DELETE sur la table protégée → **bloqués** (`insufficient_privilege`),
  ligne intacte.

**Vérification d'intégrité** (à exécuter périodiquement, service-role) :
```sql
-- toute ligne (sauf genesis) doit chaîner sur la précédente
select tenant_id, seq
from (
  select tenant_id, seq, prev_hash,
         lag(record_hash) over (partition by tenant_id order by seq) as expected_prev
  from public.audit_log
) t
where seq > 1 and prev_hash is distinct from expected_prev;   -- doit être vide
```

---

## 6. Stratégie RLS (résumé)

| Catégorie | Tables | Politique |
|---|---|---|
| **Owner strict** (le user gère ses lignes) | `investor_profiles`, `kyc_records`, `subscriptions` | `for all`: `(select auth.uid()) = user_id and tenant_id = current_tenant_id()` |
| **Owner lecture seule** (écriture service-role) | `escrow_movements`, `cap_table_entries` (holder_user_id), `distribution_payouts` (holder_user_id), `token_mints` (via profil) | `for select` filtré sur l'owner |
| **Catalogue tenant** (lecture pour tous les membres) | `tenants` (self), `operators`, `spvs`, `deals`, `bond_tranches`, `distributions` | `for select using (tenant_id = current_tenant_id())` |
| **Bulletin board** (lecture tenant, écriture auteur) | `secondary_orders` | `select` tenant + `insert/update/delete` `user_id = auth.uid()` |
| **GED** | `documents` | `select`: tenant ET (`visibility` public/restricted OU owner) |
| **Audit** | `audit_log` | `select`: tenant ET acteur ; INSERT via `append_audit_log` (SECURITY DEFINER) ; UPDATE/DELETE bloqués (trigger) |

> ⚠️ **Rappel projet** : le client **service-role bypasse la RLS**. Côté code,
> **toujours filtrer `user_id` + `tenant_id` explicitement** (cf. `CLAUDE.md`).
> Les écritures sensibles (cap table, escrow, distributions, deals) passent par
> le service-role en back-office + un appel `append_audit_log()`.

---

## 7. Intégration & déploiement

1. **Emplacement livrable** : `docs/produit/06-migrations/`. Préfixe `01xx` choisi
   pour **ne pas entrer en collision** avec la numérotation `00xx` de l'app
   d'estimation existante (`supabase/migrations/0001`…`0014`).
2. **Pré-requis** : `set_updated_at()` (0007) et `current_tenant_id()` (0003)
   doivent exister. Sur base vierge, dé-commenter le bloc helpers en tête de 0100.
3. **Extension** : `pgcrypto` dans le schéma `extensions` (déjà installé sur
   Supabase). `append_audit_log()` qualifie `extensions.digest()` car la fonction
   force `search_path=''` (durcissement). **[FAIT]** corrigé après test.
4. **Application réelle** (à l'intégration) : recopier les 6 fichiers dans
   `supabase/migrations/` puis `mcp__supabase__apply_migration` un par un (DDL,
   snake_case), **jamais `supabase db push`**. Régénérer ensuite
   `lib/supabase/database.types.ts` via `mcp__supabase__generate_typescript_types`.
5. **Advisors** : passer `mcp__supabase__get_advisors` avant prod (RLS, index,
   policies).

---

## 8. Hypothèses & points à confirmer (avocat)

- **[HYPOTHÈSE]** `tenants.distribution_regime` et `deals.offering_regime`
  matérialisent le périmètre réglementaire mais **ne remplacent pas** la
  qualification juridique fine (FIA, carte T) → à valider deal par deal.
- **[ANALYSE]** Le découplage `cap_table_entries` (DEEP) / `token_mints` (chain)
  est conçu pour que le DEEP fasse foi (Ord. 2017-1674) ; l'articulation
  opérationnelle avec un registrar (Tokeny/Securitize) reste à câbler.
- **[HYPOTHÈSE]** `secondary_orders` est volontairement un **babillard** : aucune
  logique d'appariement n'est en base. Tout glissement vers du matching
  automatique ferait basculer vers MTF/DLT Pilot → **interdit ici**.
- **[ANALYSE]** Les montants sont en `numeric(16,2)` EUR (cohérent avec l'app
  existante). Pour des volumes institutionnels, envisager `numeric(20,2)`.
