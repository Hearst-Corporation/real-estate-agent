# Architecture technique — Plateforme d'investissement immobilier tokenisé

> **Statut** : blueprint construisible v1. Domaine **architecture**.
> **Fondation juridique** : [`docs/etude-immobilier-tokenise-2026.md`](../etude-immobilier-tokenise-2026.md) — toute décision technique ci-dessous **découle** des contraintes verrouillées (anti-FIA SAN-2025-08, obligations de SAS opérationnelle, ERC-3643 miroir d'un registre DEEP source de vérité, séquestre tiers, règlement EUR, PSFP/ECSP).
> **Stack hôte** : Next.js 16.2 App Router (port 3002, Turbopack) + Supabase Postgres (RLS multi-tenant `current_tenant_id()`) + Inngest + Redis (Upstash) + Sentry/Langfuse + Electron. On **réutilise** intégralement les patterns existants (adaptateurs fail-soft `xxxIsConfigured()`, erreurs typées, RLS owner+tenant, cost-guard fail-closed, Inngest `serve()`). On **ne casse pas** l'app d'estimation/CRM existante : le nouveau domaine vit dans des bounded contexts isolés (`lib/invest/*`, `app/(invest)/*`, `app/api/invest/*`, tables préfixées `inv_*`).
> **Convention de tags juridiques** : [FAIT] = norme/décision citée dans l'étude ; [ANALYSE] = raisonnement ; [HYPOTHÈSE] = zone grise à valider avocat.

---

## 0. Principes architecturaux directeurs (les invariants qui gouvernent TOUT le code)

Ces 10 invariants sont des **contraintes d'architecture exécutoires**, pas des vœux. Chacun se traduit par un garde-fou technique concret (colonne « Enforcement »). Si un PR viole un invariant, il doit casser un test ou un check.

| # | Invariant (issu de l'étude) | Enforcement technique |
|---|---|---|
| **I1 — DEEP = source de vérité** | Le registre légal DEEP (off-chain, droit FR) est la vérité juridique. Le token ERC-3643 est un **miroir**, jamais l'inverse. [FAIT P9] | Toute écriture de propriété de titre passe par le **Ledger Service** off-chain en premier ; le mint/transfer on-chain est un **effet de bord réconcilié** (cf. §6). Aucune route ne mute la cap table à partir d'un event chain seul. |
| **I2 — Pas de pooling, pas de pré-collecte** | L'argent ne bouge JAMAIS avant qu'un deal précis soit souscrit par l'investisseur. Aucune NAV globale, aucun rebalancing. [FAIT, anti-FIA] | Pas de table « wallet de solde plateforme ». Les fonds vont en **séquestre tiers par-deal** (`inv_escrow_accounts.deal_id NOT NULL`). Contrainte SQL : un mouvement de fonds référence toujours un `subscription_id` lié à un `deal_id`. Le code n'a **aucun** endpoint « deposit balance ». |
| **I3 — Choix deal-by-deal réel** | La plateforme ne sélectionne jamais discrétionnairement à la place de l'investisseur. [FAIT SAN-2025-08] | Pas de moteur d'allocation automatique. La souscription est **toujours** un acte explicite de l'investisseur (`subscription` créée par `POST /api/invest/deals/{id}/subscribe`, jamais par un job). Pas de feature « auto-invest ». |
| **I4 — La plateforme ne détient jamais les fonds** | Séquestre tiers (notaire/EMI) obligatoire. [FAIT P10] | L'Escrow Service est un **adaptateur** vers un PSP/EMI/notaire externe. Aucune table ne stocke un solde de monnaie détenu par l'OpCo. Le déblocage est conditionné par `closing` (levée atteinte + prêt bancaire). |
| **I5 — Token = security token hors MiCA** | ERC-3643 permissionné, KYC via ONCHAINID. JAMAIS ERC-4626. [FAIT P9] | Le module on-chain n'expose qu'une interface `ITokenAdapter` modélisée sur T-REX (`canTransfer`, `isVerified`, `mint`, `forcedTransfer`, `pause`). Lint/CI : interdiction d'importer un standard vault. |
| **I6 — Règlement EUR par défaut, EURC/EURe en option via CASP** | JAMAIS USDT en UE. [FAIT P4/P10] | `inv_settlements.rail IN ('sepa_escrow','eurc','eure')`. Contrainte SQL bloque toute autre valeur. L'adaptateur stablecoin refuse tout asset non whitelisté. |
| **I7 — Tokens secrets jamais hardcodés, jamais côté client** | Règle CLAUDE.md globale. | Tous les adaptateurs lisent `process.env.X` **paresseusement** (jamais au module load), exposent `xxxIsConfigured()`, et vivent côté serveur (`runtime = "nodejs"`). Aucun secret dans `NEXT_PUBLIC_*`. |
| **I8 — Idempotence sur tout effet externe irréversible** | Mint, virement, signature : un retry ne doit jamais dupliquer un acte juridique/financier. | Clé d'idempotence obligatoire (`inv_idempotency_keys`) sur chaque commande mutante vers un tiers (KYC, escrow, mint, e-sign). Webhooks dédupliqués par `provider_event_id UNIQUE`. |
| **I9 — Multi-tenant strict + isolation par-deal** | RLS `current_tenant_id()` (existant) + ring-fencing SPV. [FAIT P4] | Toute table `inv_*` porte `tenant_id` + RLS owner/tenant (pattern existant). Les données d'un deal sont logiquement isolées par `deal_id`. Service-role bypass RLS → **toujours** filtrer `tenant_id` + `user_id` explicitement (règle CLAUDE.md). |
| **I10 — Audit trail légalement opposable** | Registre de titres, ordre d'opérations, consentements. | Table `inv_ledger_entries` **append-only** (pas d'UPDATE/DELETE — enforce par trigger + RLS). Chaque entrée hash-chaînée (`prev_hash`) → preuve d'intégrité du registre. |

---

## 1. Découpage en modules / bounded contexts

On applique un **Domain-Driven Design** avec 9 bounded contexts. Chacun = un dossier `lib/invest/<context>/`, un (ou plusieurs) namespace de routes `app/api/invest/<context>/`, un préfixe de tables `inv_<context>_*`. Les contextes communiquent par **événements de domaine** (Inngest) et par **ports/adaptateurs** (jamais d'accès direct aux tables d'un autre contexte).

```
                          ┌───────────────────────────────────────────────┐
                          │            CORE DOMAIN (cœur métier)            │
                          ├───────────────────────────────────────────────┤
   ┌──────────────┐      │  ① Investor & Identity   ② Deal & Offering      │
   │  SUPPORTING  │      │  ③ Subscription & Order  ④ Securities Ledger    │
   ├──────────────┤      │     (DEEP source vérité) ⑤ Settlement & Funds   │
   │ ⑥ Tokenization│◄────►│  ⑦ Distribution & Lifecycle                     │
   │   (on-chain   │      └───────────────────────────────────────────────┘
   │    mirror)    │                         ▲
   ├──────────────┤                         │ domain events (Inngest)
   │ ⑧ Compliance  │◄────────────────────────┤
   │   & Reporting │                         │
   ├──────────────┤      ┌──────────────────┴────────────────────────────┐
   │ ⑨ Secondary   │      │     GENERIC / SHARED (réutilisé de l'existant) │
   │   Market      │      │  Auth/JWT · Tenant/RLS · Jobs(Inngest) ·       │
   │  (bulletin    │      │  Observability(Sentry/Langfuse) · Cost-guard · │
   │   board)      │      │  Storage(R2) · LLM(Kimi/Claude) · Cockpit DS   │
   └──────────────┘      └────────────────────────────────────────────────┘
```

### Les 9 bounded contexts

| # | Contexte | Responsabilité (langage ubiquitaire) | Tables clés | Ne fait PAS |
|---|---|---|---|---|
| **① Investor & Identity** | Profil investisseur, classification averti/non-averti, suitability test ECSP, plafonds, statut KYC/AML, lien ONCHAINID↔wallet. | `inv_investor_profiles`, `inv_kyc_cases`, `inv_wallets`, `inv_onchain_identities` | Ne détient pas les fonds ; ne décide pas d'un deal. |
| **② Deal & Offering** | Cycle de vie d'une **opération** (1 SPV = 1 deal) : SPV, économie du deal, term sheet obligataire, badges, KIIS/DIS, sûretés, waterfall, fenêtre de levée. | `inv_deals`, `inv_spvs`, `inv_deal_terms`, `inv_deal_documents`, `inv_deal_badges` | Ne crée pas de souscription ; pas de matching automatique d'investisseurs. |
| **③ Subscription & Order** | Réservation **non engageante** (soft-commit) → bulletin de souscription → signature eIDAS → ordre ferme. Garde les invariants anti-FIA (acte explicite). | `inv_subscriptions`, `inv_subscription_events`, `inv_signatures` | Ne mint pas le token ; ne débloque pas les fonds (délègue à ⑤). |
| **④ Securities Ledger (DEEP)** | **Source de vérité juridique** des titres : registre obligataire, cap table off-chain, inscription DEEP, ledger append-only hash-chaîné. | `inv_securities`, `inv_holdings`, `inv_ledger_entries`, `inv_deep_registrations` | N'appelle jamais la chaîne directement ; émet des events que ⑥ consomme. |
| **⑤ Settlement & Funds** | Flux de fonds : séquestre tiers (par-deal), on/off-ramp EUR/stablecoin via CASP, closing, remboursement si échec, distributions sortantes. | `inv_escrow_accounts`, `inv_settlements`, `inv_payouts`, `inv_bank_transfers` | Ne détient jamais les fonds en propre (adaptateur EMI/notaire). |
| **⑥ Tokenization (mirror)** | **Miroir on-chain** ERC-3643 : déploiement T-REX, identity registry, compliance modules, mint/burn/transfer, réconciliation chaîne↔DEEP. | `inv_token_contracts`, `inv_token_ops`, `inv_chain_events`, `inv_reconciliation_runs` | N'est jamais source de vérité ; suit le Ledger (④). |
| **⑦ Distribution & Lifecycle** | Jalons opérationnels (travaux, photos, LTV), reporting trimestriel, IFU fiscal, calcul du **waterfall** à l'exit, déclenchement des payouts. | `inv_deal_milestones`, `inv_reports`, `inv_waterfall_runs`, `inv_tax_documents` | N'exécute pas le virement (délègue à ⑤). |
| **⑧ Compliance & Reporting** | LCB-FT (origine des fonds, screening sanctions/mixers, Travel Rule), conflits d'intérêts, reporting réglementaire PSFP/AMF, audit trail consolidé, registre des consentements. | `inv_compliance_checks`, `inv_aml_screenings`, `inv_consents`, `inv_audit_log` | Ne bloque pas en silence : statuts explicites, escalade humaine. |
| **⑨ Secondary Market** | **Bulletin board** ECSP art. 25 (babillard, **pas** de matching automatique) + transferts P2P entre wallets whitelistés via transfer restrictions du token. | `inv_listings`, `inv_listing_expressions`, `inv_transfers` | **Jamais** d'order book à matching auto (= MTF, hors périmètre). |

> **Justification du découpage** [ANALYSE] : la frontière la plus critique est **④ Ledger (off-chain, vérité) ↔ ⑥ Tokenization (on-chain, miroir)**. Les séparer en deux contextes distincts matérialise architecturalement l'invariant I1 (le code ne *peut* pas faire de la chaîne la source de vérité, car le contexte ⑥ n'a aucun droit d'écriture sur les tables de ④). De même, **③ Subscription** et **⑤ Settlement** sont séparés pour que le flux de fonds soit toujours subordonné à un acte de souscription explicite (I2/I3).

### Topologie de déploiement (mapping contextes → entités juridiques de l'étude P4)

| Entité juridique (étude) | Composant technique | Hébergement |
|---|---|---|
| **OpCo Plateforme (SAS, porte le PSFP)** | App Next.js (web + API) + back-office cap table | Vercel + Railway |
| **SPV (SAS dédiée, 1 par deal)** | Rangée `inv_spvs` + déploiement `inv_token_contracts` dédié par deal | DB + chaîne EVM |
| **Séquestre tiers (notaire/EMI)** | Adaptateur `EscrowPort` → API EMI/notaire | Externe (jamais en propre) |
| **CASP (Circle/Monerium)** | Adaptateur `StablecoinPort` | Externe régulé |
| **KYC (Sumsub) + ONCHAINID** | Adaptateur `KycPort` + `IdentityRegistryPort` | Externe + on-chain |
| **Agent de tokenisation (Tokeny)** | Adaptateur `TokenizationPort` + registrar DEEP | Externe + on-chain |
| **Signature eIDAS (Yousign)** | Adaptateur `ESignaturePort` | Externe |

---

## 2. Diagramme C4

### 2.1 Niveau 1 — Contexte système

```
                                  ┌──────────────────────────────────────┐
                                  │             ACTEURS HUMAINS            │
                                  └──────────────────────────────────────┘
   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
   │ Investisseur│   │  Opérateur │   │ Compliance │   │   Admin    │   │  Auditeur  │
   │  (retail/   │   │ immobilier │   │ /RCCI PSFP │   │ plateforme │   │ AMF/expert │
   │   averti)   │   │  (sourcing)│   │            │   │            │   │   (R/O)    │
   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
         │                │                │                │                │
         ▼                ▼                ▼                ▼                ▼
   ╔══════════════════════════════════════════════════════════════════════════════╗
   ║          PLATEFORME D'INVESTISSEMENT IMMOBILIER TOKENISÉ (le système)         ║
   ║   Marketplace deal-by-deal · obligations de SAS · DEEP + ERC-3643 miroir     ║
   ║   La plateforme ne détient jamais les fonds · choix deal-by-deal réel        ║
   ╚══════════════════════════════════════════════════════════════════════════════╝
         │          │          │          │          │          │          │
   ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌──▼─────┐ ┌──▼──────┐
   │ KYC/AML │ │Séquestre│ │ CASP   │ │Tokeniz.│ │ E-sign  │ │ Banque │ │ Chaîne  │
   │ Sumsub +│ │EMI/     │ │EURC/   │ │Tokeny +│ │ eIDAS   │ │prêteuse│ │ EVM     │
   │ONCHAINID│ │notaire  │ │EURe    │ │ DEEP   │ │ Yousign │ │(hors   │ │(Polygon │
   │         │ │(escrow) │ │(Circle/│ │registrar│ │         │ │ système│ │ /Base/  │
   │         │ │         │ │Monerium│ │        │ │         │ │ : doc) │ │ permis.)│
   └─────────┘ └─────────┘ └────────┘ └────────┘ └─────────┘ └────────┘ └─────────┘
        SYSTÈMES EXTERNES (tous via adaptateurs port + webhooks signés + idempotence)
```

> **Note frontière** [ANALYSE] : la **banque prêteuse** n'est pas intégrée techniquement (elle prête à la personne morale SPV, pas au smart contract — étude P11). Elle apparaît comme un **artefact documentaire** (term sheet, intercreditor) stocké dans `inv_deal_documents`, pas comme une API. C'est volontaire : matérialise l'invariant « la banque prête à la SAS ».

### 2.2 Niveau 2 — Conteneurs

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          PLATEFORME (frontière système)                            │
│                                                                                    │
│  ┌────────────────────────┐         ┌──────────────────────────────────────────┐  │
│  │  Web App (Next.js 16)   │         │   Electron Desktop (splash env local/prod)│  │
│  │  App Router · RSC ·      │◄───────►│   wrap de l'app web                       │  │
│  │  Cockpit DS (--ct-*)     │  HTTPS  └──────────────────────────────────────────┘  │
│  │  - (invest) marketplace  │                                                       │
│  │  - back-office opérateur │         ┌──────────────────────────────────────────┐  │
│  │  - console compliance    │         │  Wallet layer (client)                    │  │
│  └───────────┬─────────────┘         │  wagmi/viem + embedded wallet (non-crypto)│  │
│              │ server actions /        │  signe les transferts P2P whitelistés     │  │
│              │ route handlers          └──────────────────────────────────────────┘  │
│              ▼                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │  API Layer — Next Route Handlers (runtime nodejs, force-dynamic)            │    │
│  │  /api/invest/* (REST interne) + /api/invest/webhooks/* (entrants signés)    │    │
│  │  Garde : proxy.ts (JWT jose) — webhooks = HMAC, exemptés JWT                │    │
│  └───────────┬─────────────────────────────────────────────────────┬──────────┘    │
│              │                                                       │               │
│              ▼                                                       ▼               │
│  ┌──────────────────────────────────┐              ┌──────────────────────────────┐ │
│  │  Domain Layer (lib/invest/*)      │              │  Adapters (lib/invest/         │ │
│  │  9 bounded contexts · use-cases ·  │◄──ports──────│  adapters/*)                  │ │
│  │  invariants · domain events       │              │  KycPort·EscrowPort·          │ │
│  │  (pur TS, testable sans I/O)      │              │  StablecoinPort·TokenizationP.│ │
│  └──────┬───────────────────┬────────┘              │  ESignaturePort·ChainPort     │ │
│         │                   │                        └───────────────┬───────────────┘ │
│         ▼                   ▼                                        │                 │
│  ┌─────────────┐   ┌─────────────────┐                              ▼                 │
│  │ Supabase    │   │ Inngest (jobs)  │                  ┌────────────────────────┐    │
│  │ Postgres    │   │ - reconciliation│                  │  Systèmes externes      │    │
│  │ (RLS · inv_*)│  │ - distributions │                  │  (cf. C4 niveau 1)      │    │
│  │ DEEP=vérité │   │ - reporting     │                  └────────────────────────┘    │
│  └─────────────┘   │ - retries/DLQ   │                                                │
│                    └────────┬────────┘                  ┌────────────────────────┐    │
│  ┌─────────────┐            │                           │  Observability          │    │
│  │ Redis        │◄──cost-guard,                          │  Sentry (fatal) +       │    │
│  │ (Upstash)    │   ratelimit, idempotency,              │  Langfuse (LLM traces)  │    │
│  │              │   reconciliation cursor                │  + Axiom (audit stream) │    │
│  └─────────────┘            │                           └────────────────────────┘    │
│  ┌─────────────┐            │                                                          │
│  │ R2 (storage) │◄──────────┘  (KIIS/PDF, rapports, justificatifs KYC chiffrés)        │
│  └─────────────┘                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Niveau 3 — Composants (zoom sur le cœur Subscription → Settlement → Ledger → Token)

C'est le chemin le plus sensible (acte juridique + flux de fonds + mint). Il illustre la **séparation off-chain/on-chain** et la **chaîne de subordination** des invariants.

```
  POST /api/invest/deals/{id}/subscribe
            │
            ▼
  ┌───────────────────────────┐   I3: acte explicite investisseur
  │ SubscriptionService        │   I2: aucun fonds ne bouge ici
  │  - assertSuitability()     │──► InvestorPolicy (③↔①) : plafond, averti/non-averti
  │  - createSoftCommit()      │      cap = max(1000€, 5% patrimoine) si non averti
  │  - reserve (non engageant) │   [FAIT P5/P13]
  └───────────┬───────────────┘
              │ event: invest/subscription.committed
              ▼
  ┌───────────────────────────┐
  │ ESignatureService (③)      │──► ESignaturePort → Yousign (eIDAS)
  │  - bulletin souscription    │    webhook signé: invest/esign.completed
  │  - contrat d'émission       │    idempotence: provider_event_id UNIQUE
  └───────────┬───────────────┘
              │ event: invest/subscription.signed
              ▼
  ┌───────────────────────────┐   I4: séquestre tiers, jamais en propre
  │ SettlementService (⑤)      │──► EscrowPort → EMI/notaire (compte séquestre PAR DEAL)
  │  - createEscrowInstruction()│    OU StablecoinPort → Circle/Monerium (EURC/EURe)
  │  - délai réflexion 4j (ECSP)│    I6: rail ∈ {sepa_escrow, eurc, eure} JAMAIS usdt
  │  - hold jusqu'au closing    │    webhook signé: invest/funds.received
  └───────────┬───────────────┘
              │ event: invest/funds.escrowed
              ▼
  ┌───────────────────────────────────────────────────────┐
  │ ClosingOrchestrator (⑤+④+⑥) — saga (Inngest)           │
  │  CONDITIONS SUSPENSIVES : levée atteinte ∧ prêt bancaire │
  │   step 1: EscrowPort.release(deal) → fonds vers SPV     │  ─┐
  │   step 2: LedgerService.inscribeDEEP() [SOURCE VÉRITÉ]  │   │ I1: DEEP d'abord
  │   step 3: TokenizationPort.mint(ERC-3643) [MIROIR]      │   │ I8: idempotent
  │   step 4: reconcile(DEEP ↔ chain)                       │   │ I10: ledger append
  │  COMPENSATION si échec: rollback → EscrowPort.refund()  │  ─┘ (remboursement intégral)
  └───────────────────────────────────────────────────────┘
              │ event: invest/deal.closed | invest/deal.cancelled
              ▼
  ┌───────────────────────────┐
  │ LedgerService (④)          │  append-only hash-chained → inv_ledger_entries
  │  - holdings off-chain       │  inv_deep_registrations (preuve inscription)
  │  - = CAP TABLE DE RÉFÉRENCE │
  └────────────────────────────┘
```

> **Pattern clé : la saga de closing**. [ANALYSE] Le closing touche 3 systèmes externes irréversibles (escrow release, DEEP, mint). On utilise un **orchestrateur saga** (Inngest, étapes durables) avec **compensation** : si le mint échoue après le release, on ne peut pas « dé-débloquer » le séquestre, donc l'ordre est **escrow release en dernier recours conditionnel** ou, plus sûr, on inscrit DEEP + mint **avant** le release final, le release n'intervenant qu'une fois le miroir réconcilié. Si une condition suspensive n'est pas remplie (levée non atteinte / prêt refusé) → `EscrowPort.refund()` intégral, **sans pénalité** (étude P10). C'est l'ADR-005.

---

## 3. Contrats d'API (Next 16 App Router + Edge Functions Supabase)

### 3.1 Conventions transverses (toutes routes `/api/invest/*`)

- **Runtime** : `export const runtime = "nodejs"` + `export const dynamic = "force-dynamic"` (pattern existant route chat).
- **Auth** : JWT jose via `proxy.ts` (existant). Routes ouvertes ajoutées : `/api/invest/webhooks/*` (auth = HMAC signature, comme `/api/inngest`).
- **Validation** : `zod` (déjà dépendance) sur tout body/query. 422 si invalide.
- **Tenant** : toute query passe le filtre `tenant_id = current_tenant_id()` (RLS) ; le service-role filtre explicitement (règle CLAUDE.md).
- **Idempotence** : header `Idempotency-Key` obligatoire sur tout POST mutant un effet externe (souscription, instruction de fonds, mint). Stocké dans `inv_idempotency_keys` (clé + hash body → réponse mémorisée).
- **Erreurs** : `{ error: string, code: string }` JSON. 401 (non auth), 403 (tenant/RLS), 409 (conflit/idempotence), 422 (validation), 502 (provider down — fail-soft `ProviderUnavailableError`).
- **Observabilité** : `captureFatal(err, route)` sur 500 uniquement (pattern existant `lib/server/observe.ts`).

### 3.2 Catalogue des routes (REST interne)

#### ① Investor & Identity
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `POST` | `/api/invest/investor/profile` | Crée/maj profil + questionnaire suitability (averti/non-averti, capacité de perte) | investor |
| `GET` | `/api/invest/investor/profile` | Lit profil + plafonds calculés | investor |
| `POST` | `/api/invest/kyc/start` | Démarre un cas KYC → renvoie une URL/token Sumsub | investor |
| `POST` | `/api/invest/wallets` | Lie un wallet (connect/embedded) → déclenche claim ONCHAINID | investor |
| `GET` | `/api/invest/identity/status` | État consolidé KYC + ONCHAINID + whitelisting | investor |

#### ② Deal & Offering
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `GET` | `/api/invest/deals` | Liste deals ouverts (badges, statut levée, J-x). **Aucune** allocation auto. | investor |
| `GET` | `/api/invest/deals/{id}` | Fiche détaillée (KIIS, économie, waterfall, sûretés, risques) | investor |
| `POST` | `/api/invest/deals` | Crée un deal + SPV (back-office opérateur) | operator |
| `PATCH` | `/api/invest/deals/{id}` | Maj term sheet, badges, fenêtre de levée | operator |
| `POST` | `/api/invest/deals/{id}/documents` | Attache KIIS/DIS/term sheet/intercreditor (→ R2) | operator |
| `POST` | `/api/invest/deals/{id}/publish` | Passe le deal en `open` (garde compliance : KIIS validé) | compliance |

#### ③ Subscription & Order
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `POST` | `/api/invest/deals/{id}/subscribe` | **Soft-commit non engageant** (I2/I3). Vérifie suitability + plafond. | investor |
| `POST` | `/api/invest/subscriptions/{id}/sign` | Déclenche signature eIDAS (bulletin + contrat émission) | investor |
| `POST` | `/api/invest/subscriptions/{id}/cancel` | Annule (délai réflexion 4j ECSP → remboursement) | investor |
| `GET` | `/api/invest/subscriptions` | Mes souscriptions + statuts | investor |

#### ⑤ Settlement & Funds
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `POST` | `/api/invest/subscriptions/{id}/fund` | Instruit le versement vers **séquestre** (EUR ou EURC/EURe) | investor |
| `GET` | `/api/invest/settlements/{id}` | Statut d'un règlement | investor |
| `POST` | `/api/invest/deals/{id}/close` | **Closing** (saga) — conditions suspensives. Réservé. | operator+compliance (4-eyes) |
| `GET` | `/api/invest/payouts` | Distributions reçues (coupons/exit) | investor |

#### ④ Securities Ledger / ⑥ Tokenization
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `GET` | `/api/invest/ledger/{dealId}/holdings` | Cap table off-chain (source de vérité) | operator/compliance |
| `GET` | `/api/invest/ledger/{dealId}/entries` | Journal append-only (audit) | compliance/auditor |
| `GET` | `/api/invest/token/{dealId}/reconciliation` | État réconciliation DEEP↔chaîne | compliance |
| `POST` | `/api/invest/token/{dealId}/reconcile` | Force une passe de réconciliation (saga) | admin |

#### ⑦ Distribution & Lifecycle
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `POST` | `/api/invest/deals/{id}/milestones` | Ajoute un jalon travaux (photos, LTV, avancement) | operator |
| `GET` | `/api/invest/deals/{id}/milestones` | Suivi de performance (dashboard investisseur) | investor |
| `POST` | `/api/invest/deals/{id}/waterfall/run` | Calcule la cascade de distribution à l'exit | operator+compliance |
| `GET` | `/api/invest/deals/{id}/reports` | Reporting trimestriel + IFU | investor |

#### ⑧ Compliance & Reporting / ⑨ Secondary Market
| Méthode | Route | Rôle | Garde |
|---|---|---|---|
| `GET` | `/api/invest/compliance/cases` | File d'attente checks LCB-FT / escalades | compliance |
| `POST` | `/api/invest/compliance/cases/{id}/decision` | Décision compliance (approve/reject/EDD) | compliance |
| `GET` | `/api/invest/compliance/audit` | Audit trail consolidé (export) | compliance/auditor |
| `POST` | `/api/invest/listings` | Publie une annonce sur le **bulletin board** (pas de matching) | investor |
| `GET` | `/api/invest/listings` | Babillard (art. 25 ECSP) | investor |
| `POST` | `/api/invest/listings/{id}/interest` | Manifeste un intérêt (mise en relation, **pas** d'exécution auto) | investor |
| `POST` | `/api/invest/transfers/{id}/execute` | Exécute un transfert P2P whitelisté (canTransfer) | investor (4-eyes compliance si seuil) |

#### Webhooks entrants (auth = HMAC, exemptés JWT dans `proxy.ts`)
| Route | Émetteur | Effet | Sécurité |
|---|---|---|---|
| `/api/invest/webhooks/kyc` | Sumsub | Maj `inv_kyc_cases` + claim ONCHAINID | HMAC + `provider_event_id` unique |
| `/api/invest/webhooks/escrow` | EMI/notaire | `funds.received` / release confirmé | HMAC + idempotence |
| `/api/invest/webhooks/stablecoin` | Circle/Monerium | on/off-ramp confirmé | HMAC + Travel Rule check |
| `/api/invest/webhooks/esign` | Yousign | Signature complétée | HMAC + signature eIDAS |
| `/api/invest/webhooks/chain` | Indexer (Alchemy/QuickNode) | `Transfer`/`Mint` on-chain → réconciliation | HMAC + confirmations ≥ N |

### 3.3 Edge Functions Supabase (Deno) — quand et pourquoi

On garde le **gros du domaine dans Next** (cohérence avec l'existant, accès Inngest/Redis/adapters). On déporte vers les **Edge Functions Supabase** uniquement 3 cas où la proximité DB + l'isolation réseau apportent une garantie :

| Edge Function | Pourquoi en Edge (pas Next) | Trigger |
|---|---|---|
| `inv-chain-indexer` | Reçoit le webhook chaîne, vérifie les confirmations, écrit `inv_chain_events` **avant** toute logique métier. Isolé du runtime applicatif → si l'app Next est down, on ne perd pas un event on-chain. | Webhook indexer + `pg_cron` backfill |
| `inv-reconciliation-tick` | Passe périodique DEEP↔chaîne, exécutée au plus près de Postgres (lecture massive `inv_holdings` vs `inv_chain_events`), écrit `inv_reconciliation_runs`. | `pg_cron` (toutes les 5 min) |
| `inv-ledger-hashchain` | Trigger DB `BEFORE INSERT` sur `inv_ledger_entries` : calcule `prev_hash`/`entry_hash` côté base (atomicité transactionnelle, impossible à contourner depuis l'app). | DB trigger (pas une Edge Function à proprement parler — `plpgsql`) |

> [ANALYSE] On **n'abuse pas** des Edge Functions : la règle est « Next par défaut, Edge seulement pour l'intégrité on-chain/registre ». Cela évite de fragmenter la logique métier sur deux runtimes.

---

## 4. Intégrations tierces — adaptateurs (ports) avec patterns robustes

Tous les adaptateurs suivent **exactement** le contrat de `lib/providers/types.ts` existant : `xxxIsConfigured()`, `ProviderUnavailableError`, env lue paresseusement, `fetchJson` avec timeout, logs scrubés. On ajoute 4 patterns spécifiques aux effets **irréversibles** (argent, titres, identité).

### 4.1 Le contrat de port (interface stable, implémentation interchangeable)

Chaque intégration est un **port** (interface du domaine) + un ou plusieurs **adaptateurs** (impl concrète). Le domaine ne dépend que du port → on peut basculer Sumsub→Onfido, Circle→Monerium, Tokeny→Securitize **sans toucher au métier** (ADR-008). Exemple :

```typescript
// lib/invest/ports/kyc.ts — PORT (le domaine ne connaît que ça)
export interface KycPort {
  isConfigured(): boolean;
  /** Démarre un cas KYC. Idempotent par externalRef. */
  startCase(input: { investorId: string; externalRef: string; level: "basic" | "edd" })
    : Promise<{ providerCaseId: string; sdkToken: string }>;
  /** Vérifie la signature d'un webhook entrant. */
  verifyWebhook(req: { rawBody: string; signature: string }): boolean;
  /** Parse un event webhook en événement de domaine normalisé. */
  parseEvent(rawBody: string): KycDomainEvent;
}

// lib/invest/adapters/sumsub.ts — ADAPTATEUR (impl concrète, jamais importé par le domaine)
```

Ports définis : `KycPort`, `IdentityRegistryPort` (ONCHAINID), `EscrowPort`, `StablecoinPort` (CASP), `TokenizationPort` (T-REX/DEEP), `ChainPort` (RPC/indexer), `ESignaturePort` (eIDAS).

### 4.2 Les 4 patterns de robustesse (appliqués à chaque effet externe)

**Pattern A — Idempotence de commande.** Toute commande mutante vers un tiers (`startCase`, `createEscrowInstruction`, `mint`, `requestSignature`) prend une **clé d'idempotence déterministe** (ex. `mint:{subscriptionId}`). Avant l'appel : `INSERT ... ON CONFLICT DO NOTHING` dans `inv_idempotency_keys`. Si la clé existe → on retourne la réponse mémorisée, **on ne ré-appelle pas**. Garantit I8.

**Pattern B — Webhooks signés + dédup.** Tout webhook entrant : (1) vérifie la **signature HMAC/eIDAS** (`verifyWebhook`), rejet 401 sinon ; (2) `INSERT` dans `inv_webhook_events (provider, provider_event_id UNIQUE)` — si conflit, c'est un doublon → 200 no-op ; (3) traduit en **événement de domaine** Inngest. Le webhook ne fait **jamais** la logique métier inline (il enfile un event).

**Pattern C — Retries avec back-off + DLQ.** Les appels sortants passent par Inngest (`step.run`) qui retry automatiquement avec back-off exponentiel. Échec définitif → **Dead Letter Queue** (`inv_failed_operations`) + alerte compliance. Les retries sont **sûrs** car les commandes sont idempotentes (Pattern A).

**Pattern D — Circuit breaker + fail-soft.** Si un provider est down, `isConfigured()` reste vrai mais les appels échouent → on ouvre un **circuit breaker** (compteur d'échecs en Redis, comme le cost-guard) qui court-circuite les appels pendant N secondes et renvoie `ProviderUnavailableError` (502) immédiatement. Le front affiche un état dégradé explicite (jamais un faux succès).

### 4.3 Cartographie intégration par intégration

| Intégration | Port | Effets irréversibles | Webhook | Idempotence | Notes critiques (étude) |
|---|---|---|---|---|---|
| **Sumsub (KYC/AML)** | `KycPort` | Aucun (lecture identité) | `webhooks/kyc` (HMAC) | `kyc:{investorId}` | Origine des fonds obligatoire (LCB-FT). Déclenche claim ONCHAINID au pass. [FAIT P5] |
| **ONCHAINID (identity)** | `IdentityRegistryPort` | Claim on-chain (soulbound) | via chain indexer | `onchainid:{wallet}` | Identité **non transférable**. Trusted issuer = Sumsub. Pré-requis au mint (canTransfer). [FAIT P9] |
| **EMI/Notaire (séquestre)** | `EscrowPort` | **Release de fonds** (irréversible) | `webhooks/escrow` (HMAC) | `escrow:{subscriptionId}` | Compte séquestre **par deal**. Release **uniquement au closing**. Refund intégral si échec. Jamais en propre. [FAIT P10] |
| **Circle EURC / Monerium EURe (CASP)** | `StablecoinPort` | On/off-ramp (conversion) | `webhooks/stablecoin` | `ramp:{settlementId}` | **JAMAIS USDT** (whitelist asset). Travel Rule (TFR 2023/1113) au-delà du seuil. CASP porte la conformité MiCA. [FAIT I6] |
| **Tokeny (T-REX + DEEP registrar)** | `TokenizationPort` | **Mint/burn/forcedTransfer** + inscription DEEP | via chain indexer | `mint:{subscriptionId}` | DEEP = source de vérité ; mint = miroir. Déploiement contrat **par SPV/deal**. Compliance modules (lock-up, pays, plafonds). [FAIT P9] |
| **Indexer (Alchemy/QuickNode)** | `ChainPort` | Lecture chaîne | `webhooks/chain` + Edge `inv-chain-indexer` | par `tx_hash:log_index` | Confirmations ≥ N avant de traiter. Source des events de réconciliation. |
| **Yousign (eIDAS)** | `ESignaturePort` | Signature opposable | `webhooks/esign` (HMAC) | `esign:{subscriptionId}` | Bulletin + contrat d'émission. Preuve eIDAS archivée (R2 chiffré). [FAIT P5] |

---

## 5. Séparation on-chain / off-chain (DEEP = source de vérité, token = miroir, réconciliation)

C'est **le** point le plus structurant. Voici le modèle exact.

### 5.1 Qui détient quoi

```
   OFF-CHAIN (vérité juridique)                   ON-CHAIN (miroir technique)
   ════════════════════════════                   ════════════════════════════
   inv_securities      ── l'émission obligataire    inv_token_contracts ── adresse T-REX (par deal)
   inv_holdings        ── CAP TABLE de référence ──►  ERC-3643 balances  ── reflet des holdings
   inv_deep_registr.   ── preuve inscription DEEP    inv_chain_events    ── Transfer/Mint indexés
   inv_ledger_entries  ── journal append-only        ONCHAINID registry  ── claims KYC (soulbound)
        (hash-chaîné)                                compliance modules  ── lock-up, pays, plafonds
                          ▲                                    │
                          └──────── réconciliation ◄───────────┘
                              (DEEP gagne TOUJOURS en cas de divergence)
```

[FAIT P9] L'inscription en DEEP **vaut inscription en compte-titres** (Ord. 2017-1674). Donc `inv_holdings` (alimenté par l'inscription DEEP) est la **cap table opposable**. Le solde ERC-3643 est un **reflet** : utile pour les transferts P2P et la lisibilité on-chain, mais il **ne crée aucun droit** par lui-même.

### 5.2 Règle d'or de réconciliation (l'algorithme)

```
Pour chaque deal, à intervalle régulier (Edge inv-reconciliation-tick, 5 min) :
  1. Lire l'état attendu = SUM(inv_holdings) par wallet  [SOURCE DE VÉRITÉ]
  2. Lire l'état chaîne   = balances ERC-3643 (via inv_chain_events agrégés)
  3. Diff :
     - si chaîne == DEEP        → status = "in_sync"
     - si chaîne <  DEEP        → mint manquant → ré-émettre l'op de mint (idempotent)
     - si chaîne >  DEEP        → ANOMALIE GRAVE → pause du contrat + escalade compliance
     - si transfert chaîne non reflété en DEEP → enregistrer le transfert P2P en DEEP
                                                   (le bulletin board a déjà tracé l'intention)
  4. Écrire inv_reconciliation_runs (drift, actions, résolution)
  5. Toute action de correction = entrée append-only dans inv_ledger_entries
```

> **Invariant de divergence** [ANALYSE] : en cas de conflit, **DEEP gagne toujours**. Un solde on-chain supérieur au registre DEEP est traité comme une **anomalie de sécurité** (exploit, bug de mint) → `pause()` du contrat (T-REX le permet) + gel + investigation. On ne « régularise » jamais en alignant DEEP sur la chaîne. Cela rend l'invariant I1 **non contournable même en cas de compromission on-chain**.

### 5.3 Pourquoi append-only + hash-chaîné

Le registre `inv_ledger_entries` est **immuable** (trigger DB interdit UPDATE/DELETE ; RLS sans policy de mutation). Chaque entrée porte `prev_hash = hash(entrée précédente)` et `entry_hash = hash(payload + prev_hash)`. Résultat : toute altération rétroactive du registre **casse la chaîne de hash** → détectable par un simple recalcul (route `/api/invest/compliance/audit` le vérifie). C'est l'équivalent technique d'un registre de mouvements de titres légalement opposable (I10).

---

## 6. Observabilité, jobs/queue, sécurité

### 6.1 Observabilité (réutilise l'existant + 1 ajout)

| Couche | Outil (déjà branché) | Usage invest |
|---|---|---|
| **Erreurs fatales** | Sentry (`captureFatal`) | 500 routes, échec de saga closing, anomalie de réconciliation. **Pas** les 4xx ni les fail-soft. |
| **Traces LLM** | Langfuse | Génération KIIS assistée, résumés de deal (Kimi/Claude via `lib/llm/`). |
| **Audit stream** | **Axiom** (token dispo, à câbler) | **Ajout** : stream append-only des événements de domaine sensibles (subscription, funds, mint, transfer) → archive long terme requêtable pour l'AMF/audit. Complément de `inv_audit_log` (DB) pour la rétention. |
| **Métriques** | Sentry perf + Inngest dashboard | Latence closing, taux de drift réconciliation, taux d'échec webhook. |

**Alertes critiques** (Sentry + escalade compliance) : (a) `chain > DEEP` (anomalie I1) ; (b) saga closing en DLQ ; (c) webhook signature invalide répétée (attaque) ; (d) cost-guard `daily_cap_reached` sur un provider payant ; (e) escrow release sans condition suspensive remplie (ne devrait **jamais** arriver — sentinelle).

### 6.2 Jobs / queue (Inngest, déjà branché)

| Fonction Inngest | Trigger (event de domaine) | Rôle | Idempotence |
|---|---|---|---|
| `inv-closing-saga` | `invest/deal.funded` | Orchestre closing (escrow→DEEP→mint→reconcile) avec compensation | event id = `closing:{dealId}` |
| `inv-reconcile` | cron 5 min + `invest/chain.event` | Réconcilie DEEP↔chaîne (cf §5.2) | par run |
| `inv-distribution-run` | `invest/deal.exit` | Calcule waterfall → payouts via EscrowPort | `payout:{dealId}:{tranche}` |
| `inv-reporting-quarterly` | cron trimestriel | Génère rapports + IFU (→ R2) | par période |
| `inv-kyc-followup` | `invest/kyc.pending` (delay) | Relance KYC incomplet | par investor |
| `inv-dlq-handler` | `invest/op.failed` | Range en DLQ + alerte | par op |

> On **réutilise** `lib/jobs/inngest/client.ts` (même `Inngest({ id: "real-estate-agent" })`) et on **ajoute** les fonctions dans `functions.ts` (pattern existant `generatePdf` : `step`, capture d'échec, throw pour retry). Fail-soft : sans clés Inngest, le closing retombe sur un chemin synchrone gardé (comme le PDF).

### 6.3 Sécurité

- **Secrets** : tous via `process.env` (table CLAUDE.md), jamais hardcodés, jamais `NEXT_PUBLIC_*` pour un secret. Clés de signature chaîne (mint) dans un **KMS/HSM** ou signer custodial (Tokeny/Tangany), **jamais** une clé privée en clair dans l'app (ADR-006).
- **RLS** : toutes tables `inv_*` avec policy owner+tenant (pattern `0007_estimations.sql`). Service-role filtre explicitement.
- **PII/KYC** : justificatifs d'identité stockés **chiffrés** dans R2, accès loggé (`inv_audit_log`), purge selon rétention LCB-FT. Scrub systématique des logs (pattern `lib/providers/scrub.ts`).
- **4-eyes** : actions à risque (publish deal, close, transfert au-delà d'un seuil) exigent **double validation** (operator + compliance) — matérialisé par `inv_approvals (action, approver_1, approver_2)`.
- **Webhooks** : HMAC obligatoire, rejet silencieux des non signés, dédup par `provider_event_id`. Pas de logique métier inline.
- **Rate-limit** : `@upstash/ratelimit` (déjà dépendance) sur les routes publiques de souscription (anti-abus).

---

## 7. Modèle de données (extrait — tables cœur, conventions existantes)

Toutes les tables : `id uuid pk`, `tenant_id text not null default 'real-estate-agent'`, `user_id uuid references auth.users` (quand applicable), `created_at/updated_at timestamptz`, trigger `set_updated_at`, **RLS owner+tenant**, **index sur chaque FK** (règle CLAUDE.md). Migration `supabase/migrations/0015_invest_core.sql` (via `mcp__supabase__apply_migration`, jamais `db push`).

```sql
-- ② Deal & SPV (1 SPV = 1 opération)
inv_spvs(id, tenant_id, legal_name, kbis, status)            -- la SAS dédiée
inv_deals(id, tenant_id, spv_id fk, slug, status['draft','open','funded','closed','exited','cancelled'],
          deal_type['marchand_biens','locatif','value_add'],
          target_amount_eur, raised_amount_eur, min_ticket_eur, max_ticket_eur,
          ltv, expected_irr_low/mid/high, lockup_months, funding_deadline)
inv_deal_terms(id, deal_id fk, instrument['obligation_simple','obligation_subordonnee','adp'],
               coupon_floor, waterfall jsonb, intercreditor_ref)
inv_deal_badges(id, deal_id fk, badge text)                  -- cf étude P6
inv_deal_documents(id, deal_id fk, kind['kiis','dis','term_sheet','intercreditor','expertise'], r2_key)

-- ① Investor & Identity
inv_investor_profiles(id, user_id fk, classification['averti','non_averti'],
                      net_worth_band, cap_eur, suitability jsonb)
inv_kyc_cases(id, user_id fk, provider, provider_case_id, status, fund_origin_verified bool)
inv_wallets(id, user_id fk, address, chain, is_primary)
inv_onchain_identities(id, wallet_id fk, onchainid_address, claims jsonb)

-- ③ Subscription (acte explicite, non engageant d'abord)
inv_subscriptions(id, deal_id fk, user_id fk,
                  status['soft_commit','signed','funded','allocated','refunded','cancelled'],
                  amount_eur, settlement_rail['sepa_escrow','eurc','eure'])
inv_subscription_events(id, subscription_id fk, type, payload jsonb)  -- event-sourced

-- ④ Ledger (SOURCE DE VÉRITÉ — append-only)
inv_securities(id, deal_id fk, isin_or_ref, nominal_eur, total_units)
inv_holdings(id, security_id fk, wallet_id fk, units, status)         -- CAP TABLE
inv_deep_registrations(id, security_id fk, deep_ref, registered_at)
inv_ledger_entries(id, deal_id fk, seq bigint, kind, payload jsonb,
                   prev_hash, entry_hash)                             -- immuable, hash-chaîné

-- ⑤ Settlement (jamais de solde plateforme)
inv_escrow_accounts(id, deal_id fk, provider, external_ref, status)   -- PAR DEAL (I2)
inv_settlements(id, subscription_id fk, rail, amount_eur, status, provider_ref)
inv_payouts(id, deal_id fk, holding_id fk, kind['coupon','exit'], amount_eur, status)

-- ⑥ Tokenization (MIROIR)
inv_token_contracts(id, deal_id fk, chain, address, standard='ERC-3643')
inv_token_ops(id, contract_id fk, kind['mint','burn','transfer','pause'], status, tx_hash, idem_key)
inv_chain_events(id, contract_id fk, tx_hash, log_index, event_name, payload jsonb)  -- unique(tx_hash,log_index)
inv_reconciliation_runs(id, deal_id fk, drift jsonb, actions jsonb, status)

-- ⑧ Compliance & infra transverse
inv_compliance_checks(id, subject_type, subject_id, kind, status, decision)
inv_aml_screenings(id, subject_id, sanctions_hit bool, mixer_hit bool, travel_rule jsonb)
inv_consents(id, user_id fk, kind, version, accepted_at)
inv_audit_log(id, actor, action, subject, payload jsonb)
inv_idempotency_keys(id, key unique, body_hash, response jsonb)
inv_webhook_events(id, provider, provider_event_id, unique(provider, provider_event_id))
inv_approvals(id, action, subject_id, approver_1, approver_2)         -- 4-eyes
inv_failed_operations(id, op_kind, payload jsonb, last_error)         -- DLQ
```

---

## 8. ADRs (Architecture Decision Records)

> Format : **Décision · Contexte · Conséquences (+/−)**. Statut : *Accepté* (v1).

### ADR-001 — DEEP off-chain comme source de vérité, token ERC-3643 comme miroir
- **Décision** : la cap table juridique vit off-chain (DEEP + `inv_holdings`). Le token est un reflet réconcilié, sans droit propre.
- **Contexte** : [FAIT P9] l'inscription DEEP vaut inscription en compte-titres (Ord. 2017-1674) ; un solde on-chain « libre » (modèle RealT ERC-20) crée un risque juridique et de divergence.
- **Conséquences** : (+) opposabilité juridique, résistance aux exploits on-chain (DEEP gagne toujours), audit clair. (+) on peut changer de chaîne sans toucher à la vérité. (−) complexité de réconciliation (job dédié, anomalies à gérer), double écriture (mitigée par la saga idempotente).

### ADR-002 — ERC-3643 (T-REX), interdiction stricte d'ERC-4626 et d'ERC-20 libre
- **Décision** : standard unique ERC-3643 permissionné (ONCHAINID, compliance modules). `ITokenAdapter` modélisé sur T-REX. CI interdit tout standard vault.
- **Contexte** : [FAIT P9] ERC-4626 = « unité d'OPC » pour l'ESMA → **signal FIA** (le risque n°1). ERC-20 seul n'a pas de couche conformité.
- **Conséquences** : (+) anti-FIA matérialisé dans le code, KYC/transfer restrictions natives, écosystème mature (Securitize/Tokeny). (−) moins de liquidité « DeFi » (assumé : on est un security token, pas un vault), dépendance à l'agent de tokenisation.

### ADR-003 — Séquestre tiers par-deal, aucune détention de fonds en propre, aucun pooling
- **Décision** : `EscrowPort` vers EMI/notaire ; compte séquestre **par deal** (`inv_escrow_accounts.deal_id`) ; pas de table de solde plateforme ; release conditionné au closing.
- **Contexte** : [FAIT P10] détenir des fonds = service de paiement (besoin EMI/PSP). [FAIT anti-FIA] le pooling/pré-collecte est le marqueur n°1 du FIA (SAN-2025-08).
- **Conséquences** : (+) pas d'agrément EMI requis, anti-FIA fort, remboursement intégral simple si échec. (−) dépendance opérationnelle au séquestre tiers, UX moins « instantanée » (assumé).

### ADR-004 — Bounded contexts + ports/adaptateurs, isolation du domaine `invest` de l'app existante
- **Décision** : 9 bounded contexts (`lib/invest/*`), communication par events Inngest + ports ; tables préfixées `inv_*` ; routes `app/api/invest/*`. Le domaine ne dépend jamais d'un adaptateur concret.
- **Contexte** : l'app d'estimation/CRM existante ne doit pas être cassée ; les frontières métier (vérité/miroir, souscription/fonds) doivent être des frontières de code.
- **Conséquences** : (+) isolation, testabilité (domaine pur sans I/O), substituabilité des providers, non-régression de l'existant. (−) plus de boilerplate (ports), discipline d'équipe nécessaire (pas de raccourci cross-contexte).

### ADR-005 — Closing en saga orchestrée avec compensation
- **Décision** : le closing (escrow release + inscription DEEP + mint + reconcile) est une **saga Inngest** durable. Conditions suspensives (levée atteinte ∧ prêt bancaire) vérifiées avant. Échec → compensation = refund intégral.
- **Contexte** : 3 effets externes irréversibles enchaînés ; pas de transaction distribuée possible entre EMI, DEEP et chaîne.
- **Conséquences** : (+) cohérence éventuelle garantie, retries sûrs (idempotence), remboursement automatique conforme ECSP (délai 4j). (−) raisonnement asynchrone (états intermédiaires à exposer dans l'UI), nécessite une DLQ et des alertes.

### ADR-006 — Clés de signature on-chain en custody régulée / KMS, jamais en clair dans l'app
- **Décision** : le mint/forcedTransfer est signé par un **signer custodial** (Tokeny/Tangany) ou un KMS/HSM. L'app n'héberge **aucune** clé privée d'émetteur. Les wallets investisseurs signent côté client (wagmi/viem ou embedded).
- **Contexte** : une clé d'émetteur compromise = mint illimité = fraude ; [FAIT P12] Tangany/Securitize fournissent une custody régulée (BaFin/MiCA).
- **Conséquences** : (+) surface d'attaque réduite, conformité custody, séparation des pouvoirs. (−) dépendance à un custodian, latence de signature (gérée par la saga).

### ADR-007 — Marché secondaire = bulletin board ECSP art. 25, jamais de matching automatique
- **Décision** : `inv_listings` + `inv_listing_expressions` = babillard ; mise en relation manuelle ; exécution = transfert P2P whitelisté (`canTransfer`). **Aucun** order book à matching.
- **Contexte** : [FAIT P9/P13] un matching automatique = MTF/SS DLT → régime pilote DLT (infrastructure régulée), hors périmètre PSFP au lancement.
- **Conséquences** : (+) reste dans le cadre ECSP, simple, conforme. (−) liquidité limitée (jamais garantie — affiché honnêtement), pas d'exécution instantanée. Évolutif vers DLT Pilot plus tard si besoin.

### ADR-008 — Stablecoin EURC/EURe via CASP régulé uniquement, règlement EUR par défaut, USDT interdit techniquement
- **Décision** : `inv_settlements.rail IN ('sepa_escrow','eurc','eure')` (contrainte SQL) ; `StablecoinPort` whiteliste les assets et refuse tout autre ; EUR/séquestre par défaut, stablecoin en option.
- **Contexte** : [FAIT P10/P13] USDT non conforme MiCA, delisté UE ; EURC (Circle, agréé ACPR) et EURe (Monerium, EMI) conformes ; le CASP porte MiCA + Travel Rule.
- **Conséquences** : (+) conformité MiCA déléguée au CASP, pas d'exposition USDT, Travel Rule gérée à la source. (−) dépendance CASP, frais de conversion, on/off-ramp moins universel que l'EUR (assumé : EUR reste le rail par défaut).

---

## 9. Dépendances vers les autres domaines (livrables frères dans `docs/produit/`)

| Domaine frère | Ce que cette architecture **consomme** | Ce que cette architecture **fournit** |
|---|---|---|
| **05-smart-contracts** | Spécification exacte des contrats ERC-3643 (T-REX), interface `mint/burn/canTransfer/pause`, compliance modules (lock-up, pays, plafonds), ONCHAINID. → alimente `TokenizationPort` / `ChainPort`. | Les events de domaine et la frontière miroir (le contrat ne doit jamais être source de vérité). |
| **06-migrations** | Le SQL exact des tables `inv_*` (DDL complet, RLS, index, triggers append-only/hash-chain). → §7 est le contrat à implémenter. | Le modèle de données cible, les invariants à enforcer en base (contraintes `rail`, `escrow.deal_id NOT NULL`, append-only). |
| **07-moteur-financier** | Le calcul du **waterfall** à l'exit, des scénarios TRI, de la sensibilité prix/retard, du LTV/DSCR. → alimente `inv-distribution-run` et `inv-waterfall-runs`. | Les hooks d'orchestration (quand/où le moteur est appelé : closing, milestones, exit) et le format `inv_deal_terms.waterfall jsonb`. |
| **Juridique (étude)** | Toutes les contraintes verrouillées (anti-FIA, DEEP, séquestre, PSFP). | Rien (l'architecture est en aval du droit). |
| **Front/Cockpit DS** | Tokens `--ct-*`, `data-product`, shell bordeaux ; les badges produit (P6) à afficher. | Les contrats d'API REST (§3) et les états de machine (souscription, closing) à rendre dans l'UI. |

---

## 10. Risques & incertitudes (architecture)

- **[HYPOTHÈSE] Réconciliation `chaîne > DEEP`** : le traitement « pause + escalade » suppose que T-REX `pause()` est déployé et accessible au signer custodial. À valider avec le domaine smart-contracts (05) que la fonction de pause est gouvernée correctement (multisig).
- **[HYPOTHÈSE] Timing de la saga de closing** : l'ordre exact escrow/DEEP/mint dépend des garanties d'irréversibilité réelles de l'EMI partenaire (un release peut-il être « réservé » puis confirmé en 2 temps ?). À caler avec le contrat EMI/notaire réel (domaine intégrations).
- **[ANALYSE] Edge Functions vs Next** : le choix de déporter l'indexer chaîne en Edge Supabase suppose que `pg_cron` + Deno conviennent au volume d'events ; si le débit on-chain est élevé, un worker dédié (Railway) sera préférable. Décision réversible (le port `ChainPort` isole l'implémentation).
- **[INCERTAIN] Custody du signer émetteur** : ADR-006 suppose un partenaire custody (Tokeny/Tangany). Si choix d'auto-custody KMS, la gouvernance des clés (rotation, multisig, recovery) devient un sous-projet à part entière.
- **[ANALYSE] Charge réglementaire reporting PSFP** : `inv_audit_log` + Axiom couvrent l'audit trail, mais le format exact des reportings AMF/PSFP n'est pas figé — l'architecture les traite comme des exports paramétrables (domaine compliance), à valider avec l'avocat (cf. étude P15, liste de courses).
- **Dépendance forte aux providers externes** : 6 intégrations irréversibles. Mitigé par ports/adaptateurs (ADR-008) + circuit breaker + DLQ, mais une panne CASP/EMI/Tokeny dégrade le service. Plan de continuité à formaliser (étude P15).
