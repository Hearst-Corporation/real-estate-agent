# Dossier 09 — Sécurité, Custody & Risk

> **Plateforme Web3 d'investissement immobilier tokenisé sans licence de gestion de fonds (FR/UE).**
> Modèle verrouillé : SAS opérationnelle (marchand de biens / promotion) émettant des **obligations** tokenisées (security token **ERC-3643** en miroir d'un registre légal **DEEP**), distribution **PSFP/ECSP**, règlement **EUR séquestre tiers** par défaut + **EURC/EURe via CASP** en option. La plateforme ne détient **jamais** les fonds clients.
> Fondation juridique : `docs/etude-immobilier-tokenise-2026.md` (sourcée AMF/ESMA/EUR-Lex/Légifrance).
>
> **Statut des affirmations :** `[FAIT]` = norme/standard/contrôle vérifiable · `[ANALYSE]` = raisonnement sécurité · `[HYPOTHÈSE]` = à valider (pentest, avocat, RSSI, CASP).
> Ce dossier est un **plan de sécurité produit**, pas une certification. Toute mise en prod exige un pentest tiers, un audit smart contract tiers, et une revue DORA par un cabinet spécialisé.

---

## 0. TL;DR — ce qui gouverne tout ce dossier

1. **La plateforme ne touche jamais les fonds.** Le séquestre tiers (notaire/CARPA/EMI) est la première barrière de sécurité ET la pierre angulaire anti-FIA. Tout design custody en découle. `[FAIT]` (étude P10)
2. **Deux mondes de clés, jamais mélangés.** (a) Clés **plateforme** (deployer/owner/agent ERC-3643, signataires `mint`/`forcedTransfer`) → **MPC/HSM custody régulé** (Fireblocks / Tangany BaFin), multi-sig, séparation des rôles. (b) Clés **investisseur** → **self-custody** (embedded wallet non-custodial type Privy/Turnkey, ou wallet externe). La plateforme ne détient **jamais** la clé privée d'un investisseur. `[ANALYSE]`
3. **Le registre DEEP est la source de vérité légale ; la chaîne est un miroir.** En cas de divergence chaîne↔registre, **le DEEP fait foi** (Ord. 2017-1674). Cela borne le blast-radius d'un exploit on-chain : un token volé ne transfère **pas** la propriété juridique de la créance. `[FAIT]` (étude P9)
4. **Le service-role Supabase bypass la RLS.** C'est le risque applicatif n°1 (cf. matrice). Chaque accès service-role DOIT filtrer `tenant_id` + `user_id` explicitement, ne jamais être importé côté client, ne jamais fuiter dans un bundle, un log ou une réponse d'erreur.
5. **DORA s'applique.** `[FAIT]` Le PSFP est une « entité financière » au sens DORA (Règl. UE 2022/2554, applicable depuis 17/01/2025) → registre des prestataires TIC critiques (Supabase, Vercel, CASP, KYC, custody), tests de résilience, gestion d'incidents avec **reporting réglementaire**, clauses contractuelles DORA.
6. **Sanctions/AML on-chain = bloquant.** Tout wallet entrant est screené (OFAC/UE/sanctions + exposition mixers/darknet) **avant** whitelisting ONCHAINID et **avant** chaque on-ramp stablecoin. Travel Rule (TFR 2023/1113) sur tout flux crypto. `[FAIT]` (étude P10)

---

## 1. Périmètre, actifs à protéger & acteurs

### 1.1 Actifs (par criticité)

| # | Actif | Confidentialité | Intégrité | Disponibilité | Pourquoi critique |
|---|---|:--:|:--:|:--:|---|
| A1 | **Clés plateforme on-chain** (owner/agent ERC-3643, deployer, upgrade) | 🔴 | 🔴 | 🟠 | Compromission = mint sauvage, `forcedTransfer`, freeze global, upgrade malveillant |
| A2 | **Cap table / registre DEEP** (source de vérité légale) | 🟠 | 🔴 | 🟠 | Altération = contestation de propriété des créances |
| A3 | **`SUPABASE_SERVICE_ROLE_KEY`** | 🔴 | 🔴 | — | Bypass RLS total → lecture/écriture cross-tenant |
| A4 | **`JWT_SECRET`** (signature sessions jose) | 🔴 | 🔴 | — | Forge de session = usurpation de n'importe quel user/tenant/role |
| A5 | **PII + KYC investisseurs** (identité, justif. domicile, origine des fonds) | 🔴 | 🟠 | 🟠 | RGPD art. 9/32 + LCB-FT ; fuite = sanction CNIL + réputation |
| A6 | **Données de paiement / IBAN / réf. séquestre** | 🔴 | 🔴 | 🟠 | Fraude au virement (BEC), détournement de fonds |
| A7 | **Clés API LLM/infra** (`ANTHROPIC_API_KEY`, `HYPERCLI_API_KEY`, `RESEND_API_KEY`, CASP, KYC) | 🔴 | — | — | Exfiltration = coût + pivot + spoofing email |
| A8 | **Documents légaux signés** (souscription, intercreditor, KIIS) | 🟠 | 🔴 | 🟠 | Intégrité probatoire (eIDAS) |
| A9 | **Wallets investisseurs whitelistés** (mapping wallet↔identité) | 🔴 | 🔴 | 🟠 | Lien pseudonymat↔identité réelle ; cible de désanonymisation |
| A10 | **Disponibilité de la plateforme** (souscription, séquestre, mint) | — | — | 🔴 | Fenêtre de closing ratée = remboursement, perte de confiance |

### 1.2 Surfaces d'attaque (zones du threat model)

- **Z1 — Web/Front** : Next.js App Router (port 3002), CockpitShell, formulaires KYC/souscription, wallet connect, embedded wallet.
- **Z2 — API Next** (`app/api/*`) : auth, leads, estimations, documents, swarms, cockpit-chat, + futures routes `deals`/`subscriptions`/`tokenization`/`escrow`/`webhooks`.
- **Z3 — Supabase** : Postgres + RLS multi-tenant (`current_tenant_id()`), service-role, Storage, hook JWT `custom_access_token_hook`, vues, edge functions.
- **Z4 — On-chain** : smart contracts ERC-3643 (Token, IdentityRegistry, Compliance modules, ONCHAINID), clés admin, RPC, indexeur.
- **Z5 — Séquestre & paiement** : EMI/notaire/CARPA, virements SEPA, réconciliation, webhooks PSP.
- **Z6 — Intégrations tierces** : KYC (Sumsub/Onfido), CASP (Circle/Monerium), tokenisation (Tokeny/Securitize), e-sign (Yousign), email (Resend), LLM (Claude/Kimi/OpenAI), Inngest, Composio, Sentry, Langfuse, Upstash.
- **Z7 — Desktop Electron** : splash sélecteur d'env, IPC, contextIsolation, mises à jour signées.
- **Z8 — CI/CD & secrets** : Vercel/Railway, GitHub, `.env.local`, build artifacts, supply chain npm.

### 1.3 Acteurs de menace (threat actors)

| Acteur | Capacité | Motivation | Cible primaire |
|---|---|---|---|
| **Attaquant on-chain opportuniste** | Lecture mempool, scan contrats, MEV | Vol de tokens/fonds | Z4 |
| **APT / groupe ciblant la crypto** (ex. Lazarus) | Spear-phishing signataires, supply chain, 0-day | Vol des clés plateforme (A1) | Z4, Z6, équipe |
| **Investisseur malveillant** | Compte légitime KYC | Cross-tenant, escalade, fraude remboursement | Z2, Z3 |
| **Insider** (dev, ops, opérateur immo) | Accès code/infra/secrets | Détournement, exfiltration PII | Z3, Z8, A3/A4 |
| **Fraudeur paiement** (BEC) | Ingénierie sociale, spoof email | Détourner un virement de souscription/distribution | Z5, A6 |
| **Blanchisseur / entité sanctionnée** | Fonds illicites, wallet « sale » | Injecter via on-ramp, KYC frauduleux | Z5, KYC |
| **Script kiddie / bot** | Scan automatisé, creds stuffing | Brute force login, enum API | Z1, Z2 |
| **Régulateur / litige** (non malveillant mais à risque) | Réquisition, contrôle | Requalification, non-conformité DORA/RGPD | transverse |

---

## 2. Threat Model STRIDE complet

> Méthode : STRIDE par zone. Chaque ligne = menace → vecteur → mitigation → statut. Les `[FAIT]` correspondent à des contrôles **déjà présents** dans le repo (vérifiés) ; les autres sont **à implémenter** (cf. §11 backlog).

### 2.1 Z1 — Web / Front

| STRIDE | Menace | Vecteur | Mitigation | Réf. |
|---|---|---|---|---|
| **S** | Usurpation de session | Vol de cookie, XSS | Cookie `httpOnly` + `Secure` + `SameSite=Lax`, JWT HS256 jose, sliding session | `[FAIT]` `lib/server/auth-cookie.ts`, `proxy.ts` |
| **T** | Injection de contenu malveillant | XSS stocké (champ deal, message chat) | React escaping par défaut, CSP stricte (à durcir), DOMPurify si `dangerouslySetInnerHTML`, sanitization Markdown LLM | `[À FAIRE]` CSP |
| **R** | Déni d'action | Pas de trace côté UI | Tout flux financier loggé serveur (audit log immuable) | `[À FAIRE]` §6.4 |
| **I** | Fuite de PII dans le HTML/JS | SSR exposant trop, source map en prod | Pas de service-role côté client, `productionBrowserSourceMaps:false`, scrubbing Sentry | `[ANALYSE]` |
| **D** | Déni de service applicatif | Flood formulaires | Rate-limit Upstash, Vercel/Cloudflare WAF | `[FAIT]` partiel `lib/ratelimit.ts` |
| **E** | Élévation via wallet connect | Wallet non whitelisté tente de souscrire | Vérif ONCHAINID + statut KYC côté serveur avant toute action sensible | `[À FAIRE]` |

**Contrôles front transverses à ajouter :**
- **CSP stricte** (nonce, `default-src 'self'`, `connect-src` whitelist RPC/CASP/KYC/Supabase, `frame-ancestors 'none'`).
- **Headers de sécurité** : `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (désactiver capteurs/géoloc inutiles), `X-Frame-Options: DENY`.
- **SRI** sur scripts tiers (wallet/analytics) ; pas de tiers non-essentiel.
- **Anti-clickjacking** sur le flux de signature/transaction wallet.

### 2.2 Z2 — API Next (`app/api/*`)

| STRIDE | Menace | Vecteur | Mitigation | Réf. |
|---|---|---|---|---|
| **S** | Forge de JWT | `JWT_SECRET` faible/fuite | Secret ≥ 256 bits aléatoire (vault), rotation, vérif `sub`+`tenant_id` | `[FAIT]` partiel `lib/server/auth.ts` (à durcir : rotation + entropie) |
| **S** | Webhook spoofé (CASP/PSP/KYC/Inngest) | Endpoint webhook non signé | Vérif **signature HMAC**/JWS par fournisseur + allowlist IP + idempotency key | `[FAIT]` Inngest (HMAC) ; `[À FAIRE]` CASP/PSP/KYC |
| **T** | Injection SQL | Query brute non paramétrée | Client Supabase paramétré, **interdiction** de `execute_sql` dynamique avec input user | `[ANALYSE]` |
| **T** | Mass assignment | Body non validé écrit en DB | **Zod** sur 100 % des entrées (déjà dépendance), allowlist de champs | `[FAIT]` partiel (zod présent) ; généraliser |
| **R** | Action financière non traçable | Souscription/remboursement sans log | Audit log append-only signé (qui/quoi/quand/montant/IP) | `[À FAIRE]` |
| **I** | IDOR / fuite cross-objet | `/api/.../[id]` sans contrôle d'appartenance | **Filtrer `tenant_id`+`user_id`** sur chaque accès service-role ; tests IDOR | `[FAIT]` pattern documenté ; `[À FAIRE]` couverture exhaustive |
| **I** | Fuite de secret dans une erreur | Stack trace renvoyée au client | Handler d'erreur normalisé (pas de détail interne en prod) | `[À FAIRE]` |
| **D** | Abus d'endpoint coûteux (LLM, PDF, enrich) | Spam → coût API | Rate-limit **par user+route**, quotas, timeouts, circuit breaker | `[FAIT]` partiel (LLM `fail-open` → voir risque R-09) |
| **E** | Escalade de privilège | `role` falsifié, route admin non gardée | Contrôle `role`+`scope` côté serveur sur **chaque** route admin ; pas de confiance au client | `[À FAIRE]` audit routes `app/api/admin/*` |

**Spécifique flux financier (routes futures `deals`/`subscriptions`/`escrow`/`tokenization`) :**
- **Idempotency-Key obligatoire** sur souscription, déblocage séquestre, mint, distribution (anti double-exécution / replay).
- **State machine serveur** stricte du cycle souscription (`soft_commit → signed → funds_in_escrow → closing → minted | refunded`) ; aucune transition pilotée par le client.
- **Réconciliation** montant souscrit ↔ montant séquestre ↔ montant tokenisé (contrôle d'intégrité 3-way avant mint).
- **Concomitance fonds/titres** (DvP) : le mint n'est déclenché que sur preuve de closing (séquestre débloqué + prêt accordé) ; sinon remboursement intégral. `[FAIT]` (exigence étude P10)

### 2.3 Z3 — Supabase (le cœur applicatif)

> **Constat repo (vérifié) :** RLS multi-tenant en place via `current_tenant_id()` (lit `auth.jwt() -> app_metadata -> tenant_id`), policies `(select auth.uid())` + `tenant_id`, hook `custom_access_token_hook` correctement `revoke`d de `authenticated/anon/public`, fonctions `set search_path = ''`. Bon socle. **Mais** l'app utilise massivement le **service-role** (`getSupabaseAdmin()`) qui **bypass la RLS**.

| STRIDE | Menace | Vecteur | Mitigation | Réf. |
|---|---|---|---|---|
| **S** | Bypass auth via anon key | Anon key utilisée pour data sensible | Anon key = lecture publique stricte uniquement ; tout le reste service-role filtré OU RLS authenticated | `[ANALYSE]` |
| **T** | Altération cross-tenant | Service-role sans filtre `tenant_id` | **Règle d'or** : chaque appel service-role filtre `tenant_id`+`user_id` ; helper `assertOwnership()` ; tests | `[FAIT]` doc CLAUDE.md ; `[À FAIRE]` enforcement |
| **R** | Modif DB non auditée | Écriture directe sans trace | `pgaudit` / triggers d'audit sur tables financières ; logs Supabase conservés | `[À FAIRE]` |
| **I** | **Fuite du service-role key** | Hardcode, bundle client, log, repo public | `process.env` only (✓), `.gitignore` (✓), **scan secrets CI** (gitleaks), rotation, **jamais** dans `NEXT_PUBLIC_*` | `[FAIT]` partiel ; `[À FAIRE]` gitleaks + rotation |
| **I** | Vue/RPC exposant trop | `SECURITY DEFINER` mal cadré, vue sans RLS | Auditer toute fonction `SECURITY DEFINER` (`search_path` fixé ✓ pour les 2 vues), `security_invoker=on` sur les vues, `get_advisors` avant prod | `[À FAIRE]` `mcp__supabase__get_advisors` |
| **I** | Storage public en fuite | Bucket public, URL devinable | Buckets **privés** + signed URLs courtes ; policies Storage par tenant ; pas d'IDs séquentiels | `[À FAIRE]` audit `lib/storage/` |
| **D** | Épuisement connexions/quota | Requêtes lourdes, N+1 | Pooling (pgbouncer), index sur FK (partiellement fait), pagination | `[FAIT]` partiel (index FK) |
| **E** | Escalade via hook JWT | Hook réécrivant `role`/`tenant_id` à partir d'input non fiable | Hook lit `app_metadata` (côté serveur Supabase), `revoke` execute des rôles publics ✓ ; ne **jamais** dériver le tenant d'un input client | `[FAIT]` `0005_jwt_tenant_hook.sql` |

**Plan de durcissement Supabase (priorisé) :**
1. **Inventaire service-role** : recenser chaque `getSupabaseAdmin()` (3 fichiers identifiés : `lib/server/supabase.ts`, `lib/estimation/owned.ts`, `app/api/brochure/[token]/pdf/route.ts`) → vérifier le filtre `tenant_id`+`user_id` sur **chaque** requête. Les routes financières futures hériteront de ce contrôle.
2. **Helper d'ownership** centralisé : `assertOwnership({ table, id, userId, tenantId })` lancé avant toute mutation service-role.
3. **RLS « defense in depth »** : garder RLS activée même sur les tables accédées en service-role, pour qu'une bascule accidentelle vers la clé anon ne fuite rien.
4. **`get_advisors` (security + performance)** en gate CI avant chaque prod ; zéro advisor `ERROR`.
5. **pgaudit** sur tables `subscriptions`, `escrow_movements`, `token_events`, `kyc_records`.
6. **Rotation programmée** service-role + JWT_SECRET (procédure §6.5).
7. **Storage** : tous buckets KYC/documents = privés, RLS Storage par `tenant_id`, signed URLs ≤ 5 min.

### 2.4 Z4 — On-chain (smart contracts ERC-3643)

| STRIDE | Menace | Vecteur | Mitigation | Réf. |
|---|---|---|---|---|
| **S** | Usurpation d'agent/owner | Clé admin volée | **MPC/HSM + multi-sig (Safe)** pour owner/agent ; aucune EOA solo | `[À FAIRE]` §4 |
| **T** | Mint/burn/transfer illégitime | `mint()`/`forcedTransfer()` appelé par compromission | Séparation des rôles (agent ≠ owner ≠ upgrader), timelock sur actions sensibles, plafonds | `[À FAIRE]` |
| **T** | Bypass des règles de conformité | Module Compliance mal câblé, `canTransfer` contournable | Tests d'invariants exhaustifs (cf. §3.2), audit tiers, `isVerified()` obligatoire avant transfert | `[À FAIRE]` |
| **R** | Action admin non traçable | Multi-sig opaque | Tous events on-chain + journal off-chain réconcilié ; Safe = signataires connus | `[ANALYSE]` |
| **I** | Désanonymisation | Mapping wallet↔identité on-chain | ONCHAINID = claims **hashés** (pas de PII en clair on-chain), identité soulbound | `[FAIT]` (design ERC-3643) |
| **D** | Gel/blocage du token | Pause non révocable, clé pause perdue | `pause`/`unpause` multi-sig, runbook de récupération, le **DEEP reste opérationnel** même chaîne figée | `[ANALYSE]` |
| **E** | Upgrade malveillant (proxy) | Proxy upgradable détourné | **Timelock + multi-sig** sur upgrade, ou contrats **non-upgradables** pour le Token (préféré), upgrade limité aux modules compliance | `[HYPOTHÈSE]` arbitrage §3 |

**Garde-fou architectural clé `[ANALYSE]` :** le **registre DEEP est la source de vérité légale**. Un attaquant qui réussirait un `forcedTransfer` on-chain ne transfère **pas** la propriété juridique de la créance — la plateforme peut geler le token, corriger le miroir on-chain depuis le registre, et la sanction reste off-chain. Cela **réduit drastiquement** l'impact financier d'un exploit smart contract (vol de jeton ≠ vol de créance). C'est l'inverse d'un protocole DeFi pur où le code *est* la loi.

### 2.5 Z5 — Séquestre & paiement

| STRIDE | Menace | Vecteur | Mitigation | Réf. |
|---|---|---|---|---|
| **S** | Fraude au virement (BEC) | Email spoofé « nouvel IBAN séquestre » | IBAN séquestre **non modifiable** côté UI, affiché depuis source serveur signée, double-confirmation, DMARC/DKIM/SPF stricts (Resend) | `[À FAIRE]` |
| **T** | Altération du montant/destinataire | MITM, réconciliation faussée | Réconciliation automatique séquestre↔souscription, webhooks signés, contrôle 4-eyes sur déblocage | `[À FAIRE]` |
| **R** | Contestation de versement | Pas de preuve | Référence unique par souscription, journal séquestre, eIDAS sur bulletin | `[FAIT]` (design étude) |
| **I** | Fuite IBAN/PII paiement | Logs, base, support | Chiffrement au repos (Supabase), masquage IBAN en UI/logs, accès restreint | `[À FAIRE]` |
| **D** | Indispo au closing | Panne PSP/EMI | Procédure de repli (virement manuel notaire), fenêtre de closing avec marge, remboursement auto si échec | `[ANALYSE]` |
| **E** | Déblocage non autorisé | Un seul opérateur débloque | **Séquestre tiers contrôle le déblocage** (notaire/EMI), conditions suspensives vérifiées, 4-eyes | `[FAIT]` (le tiers détient, pas la plateforme) |

> **Point de conformité majeur :** la plateforme **n'encaisse jamais** les fonds. C'est à la fois la mitigation de fraude la plus forte (pas de honeypot de fonds clients) ET l'exigence réglementaire (étude P10 : détenir des fonds en propre = service de paiement non autorisé + signal FIA).

### 2.6 Z6 — Intégrations tierces

| STRIDE | Menace | Vecteur | Mitigation |
|---|---|---|---|
| **S** | Webhook tiers spoofé | KYC/CASP/PSP callback forgé | Signature/HMAC par fournisseur, allowlist IP, idempotency |
| **T** | Réponse tierce altérée (MITM) | KYC « approved » falsifié | TLS pinning si dispo, vérif statut via **pull** API en plus du push webhook |
| **I** | Fuite de clé API tierce | Hardcode, log | `process.env`, scoping minimal, rotation, secrets vault |
| **D** | Dépendance critique down | CASP/KYC/RPC indispo | **DORA** : redondance, fournisseurs de secours, dégradation gracieuse, RTO défini |
| **E** | Sur-permission OAuth (Composio/Gmail/Drive) | Token large | Scopes minimaux, revue des connecteurs, pas d'accès prod via connecteurs perso |
| **—** | **Prompt injection LLM** | Doc/lead malveillant exfiltre via Claude/Kimi | Pas de secret dans le contexte LLM, sortie LLM **jamais** exécutée/SQL, allowlist d'outils Composio, sandbox | (cf. §2.7) |

### 2.7 Menace transverse — LLM (Claude / Kimi / OpenAI / Composio)

`[ANALYSE]` La plateforme intègre des LLM (cockpit-chat Kimi, enrichissement leads, swarms, parsing documents). Risques spécifiques :

- **Prompt injection / exfiltration** : un document de deal ou un lead piégé pourrait instruire le LLM d'exfiltrer du contexte. **Mitigation** : aucun secret/PII sensible dans les prompts ; séparation données/instructions ; sortie LLM traitée comme **non fiable** (jamais de SQL/commande/transfert déclenché directement par une sortie LLM).
- **Outils Composio en écriture** : un agent LLM pilotant Gmail/Drive/etc. → **allowlist stricte d'outils**, jamais d'action financière/on-chain déclenchée par LLM, human-in-the-loop pour toute action irréversible.
- **Fuite mémoire tenant (`tenant_memory`)** : la réinjection des 20 derniers souvenirs DOIT être filtrée par `tenant_id`+`user_id` (vérifier la requête). `[À FAIRE]` audit.
- **Coût / abus** : rate-limit par user, quotas, budget cap par tenant.
- **Filtre `<think>` Kimi** : déjà câblé serveur (CLAUDE.md) — ne pas exposer le raisonnement brut côté client (peut contenir des fragments de contexte).

### 2.8 Z7 — Desktop Electron

| STRIDE | Menace | Mitigation |
|---|---|---|
| **T/E** | RCE via renderer | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, preload minimal, validation IPC |
| **S** | Update malveillant | `electron-updater` + **builds signés/notarisés** (déjà : `hardenedRuntime:true`, entitlements) `[FAIT]` partiel |
| **I** | Secret embarqué dans l'app | Aucun secret dans le bundle Electron ; tout passe par l'API serveur authentifiée |
| **T** | Chargement de contenu distant non fiable | `webSecurity:true`, navigation restreinte (allowlist d'origines), pas de `webview` arbitraire |

### 2.9 Z8 — CI/CD & supply chain

| STRIDE | Menace | Mitigation |
|---|---|---|
| **I** | Fuite secret dans le repo/CI | **gitleaks** en pre-commit + CI, `.env.local` gitignored ✓, secrets en vault Vercel/Railway, masquage logs CI |
| **T** | Dépendance npm compromise | Lockfile (✓ `package-lock.json`), `npm audit` CI, Dependabot/Renovate, pin des versions, vérif provenance pour libs crypto |
| **T** | Build empoisonné | Builds reproductibles, signature artefacts, accès CI restreint, branches protégées + review obligatoire |
| **S** | Compromission compte GitHub/Vercel | 2FA obligatoire, clés à courte durée, principe du moindre privilège, pas de `--no-verify` (deny-list globale ✓) |

---

## 3. Sécurité des smart contracts ERC-3643

### 3.1 Architecture cible & séparation des rôles

```
                    ┌────────────────────────────────────────────┐
                    │  SAFE MULTI-SIG OWNER (3/5)                 │
                    │  (gouvernance — clés MPC/HSM réparties)     │
                    └───┬───────────────┬───────────────┬────────┘
                        │ owner         │ owner         │ owner
        ┌───────────────▼───┐   ┌───────▼────────┐  ┌───▼──────────────┐
        │ TOKEN ERC-3643    │   │ IDENTITY        │  │ COMPLIANCE       │
        │ (1 par SPV/deal)  │   │ REGISTRY        │  │ (modules)        │
        │ • mint (agent)    │   │ • register/     │  │ • country restr. │
        │ • burn (agent)    │   │   update ID     │  │ • lock-up        │
        │ • forcedTransfer  │   │ • trusted       │  │ • max holders    │
        │ • pause/unpause   │   │   issuers (KYC) │  │ • transfer rules │
        └────────┬──────────┘   └────────┬───────┘  └──────────────────┘
                 │ AGENT role             │
        ┌────────▼───────────┐   ┌────────▼───────────┐
        │ AGENT WALLET (2/3) │   │ ONCHAINID per      │
        │ MPC custody —      │   │ investor (soulbound│
        │ ops mint/freeze    │   │ KYC claims hashed) │
        └────────────────────┘   └────────────────────┘
```

**Principes `[ANALYSE]` :**
- **Owner ≠ Agent ≠ Upgrader.** L'`owner` (gouvernance, Safe 3/5) gère la config ; l'`agent` (Safe 2/3, opérations) fait `mint`/`freeze` au quotidien ; aucun rôle n'est une EOA solo.
- **Token non-upgradable de préférence** (immuabilité = confiance) ; si proxy nécessaire, **timelock ≥ 48 h + multi-sig** sur l'upgrade, et upgrade limité aux **modules Compliance** (jamais à la logique de propriété).
- **Timelock** sur les actions à fort impact (changement de trusted issuer KYC, ajout d'agent, upgrade).
- **Plafonds** : `forcedTransfer` et `mint` bornés par opération (cohérence avec le montant DEEP).
- **Clé pause** accessible rapidement (kill-switch) mais en multi-sig 2/3 pour éviter l'abus.

### 3.2 Invariants à vérifier (tests + audit tiers)

`[FAIT]` (liste d'invariants à implémenter en property-based testing / Foundry invariant + Slither/Mythril) :

| # | Invariant | Pourquoi |
|---|---|---|
| INV-1 | **Aucun transfert si `isVerified(to) == false`** | Coeur ERC-3643 : pas de token à un wallet non-KYC |
| INV-2 | **`canTransfer()` respecte tous les modules Compliance** (pays, lock-up, max holders) | Conformité réglementaire on-chain |
| INV-3 | **`totalSupply` on-chain == total émis au registre DEEP** | Intégrité miroir (réconciliation) |
| INV-4 | **Seul `agent` peut `mint`/`burn`/`forcedTransfer`** | Séparation des rôles |
| INV-5 | **Seul `owner` peut changer trusted issuers / modules / agent** | Gouvernance |
| INV-6 | **Token gelé (`pause`) ⇒ aucun transfert ne passe** | Kill-switch effectif |
| INV-7 | **Lock-up : aucun transfert avant `unlockDate`** | Clause d'inaliénabilité (étude P6) |
| INV-8 | **Pas de re-entrancy sur mint/transfer/recovery** | Sécurité classique |
| INV-9 | **`forcedTransfer` (recovery) ⇒ event émis + journal off-chain** | Traçabilité / DEEP |
| INV-10 | **ONCHAINID soulbound : claim non transférable** | Identité non cessible |
| INV-11 | **Pas d'overflow/underflow (Solidity ≥0.8 + checks)** | Intégrité comptable |
| INV-12 | **Wallet sanctionné retiré de l'IdentityRegistry ⇒ ne peut plus recevoir** | Sanctions on-chain |

### 3.3 Audits tiers & processus `[FAIT]`

- **2 audits indépendants** avant mainnet (ex. parmi : OpenZeppelin, Trail of Bits, ChainSecurity, Halborn, Hacken) — ne pas se reposer sur l'audit du standard T-REX seul ; auditer **notre déploiement + modules custom**.
- **Outils en CI** : Slither, Mythril, Echidna/Foundry invariants, solhint, coverage ≥ 95 % sur la logique de transfert.
- **Bug bounty** (Immunefi/HackenProof) avant et après lancement, scope = contrats déployés + plateforme.
- **Réutiliser le code audité de Tokeny (T-REX)** plutôt que réécrire ; ne customiser que les modules Compliance, qui sont alors re-audités.
- **Freeze de version** : adresse de contrat + bytecode + commit hash publiés (fiche deal, étude P7) ; vérification on-chain (Etherscan verify).

### 3.4 Choix de chaîne `[HYPOTHÈSE]`

- **Préférence** : L2 EVM à finalité rapide et faible coût (**Base** ou **Polygon PoS**), ou **chaîne permissionnée** si exigence de contrôle total (DLT Pilot). Arbitrage à trancher avec l'agent de tokenisation (Tokeny/Securitize) et le dossier 05-smart-contracts.
- Critères : maturité écosystème ERC-3643, coût de `mint`/transfert, réorg risk (finalité), disponibilité custody (Fireblocks/Tangany supporte la chaîne), conformité.
- **RPC** : fournisseur redondant (2 providers), pas de dépendance à un seul endpoint ; indexeur own/managé pour la réconciliation.

---

## 4. Stratégie de custody des clés

### 4.1 Deux mondes, jamais mélangés `[ANALYSE]`

| | **Clés PLATEFORME** | **Clés INVESTISSEUR** |
|---|---|---|
| **Quoi** | owner/agent/upgrader ERC-3643, deployer | wallet de réception des tokens |
| **Modèle** | **Custody régulé MPC/HSM + multi-sig** (Fireblocks, Tangany BaFin, ou Safe + signataires MPC) | **Self-custody** (non-custodial) |
| **Qui contrôle** | Gouvernance (signataires répartis, 4-eyes) | L'investisseur seul |
| **Pourquoi** | Empêcher un point unique de compromission ; conformité custody | La plateforme ne doit **jamais** détenir les actifs/fonds clients (anti-FIA, anti-service de paiement, RGPD) |

> **Règle absolue :** la plateforme ne détient **jamais** la clé privée d'un investisseur, ni ses fonds. Si elle proposait du custody investisseur, elle basculerait vers un service de conservation crypto (MiCA art. 75 / CASP) **et** rapprocherait du signal FIA. → **self-custody investisseur, custody régulé uniquement pour les clés opérationnelles plateforme.**

### 4.2 Clés plateforme — cycle de vie & contrôles

`[FAIT]` (exigences custody) :
1. **Génération** : dans le HSM/MPC (Fireblocks/Tangany) ou cérémonie de clés air-gapped pour le Safe ; **jamais** sur un laptop dev.
2. **Stockage** : MPC (pas de clé privée reconstituée) ou HSM FIPS 140-2 niveau 3 ; signataires Safe sur hardware wallets distincts (Ledger), répartis géographiquement.
3. **Quorum** : owner 3/5, agent 2/3 (chiffres à arbitrer) ; politique de transaction (Fireblocks TAP) avec allowlist d'adresses et plafonds.
4. **Usage** : 4-eyes pour `mint`/`forcedTransfer`/upgrade ; tout passe par un workflow approuvé (pas de signature ad-hoc).
5. **Rotation** : rotation des signataires en cas de départ ; révocation immédiate (retrait du Safe) ; clé de deployer **mise hors-service** après déploiement.
6. **Sauvegarde/recovery** : MPC backup chez le custodian ; pour le Safe, procédure de remplacement de signataire documentée (runbook §6).
7. **Séparation prod/test** : clés testnet **totalement disjointes** des clés mainnet.

### 4.3 Wallets investisseurs — embedded vs externe & cycle whitelist

`[ANALYSE]` Deux options offertes (étude P5, étape 3) :
- **Embedded wallet non-custodial** (Privy / Turnkey / Magic) pour les non-crypto : la clé est dérivée côté utilisateur (MPC client-side / passkey / TEE), **jamais détenue par la plateforme**. UX simple, self-custody préservé.
- **Wallet externe** (MetaMask/WalletConnect) pour les crypto-natifs.

**Cycle de vie d'un wallet whitelisté :**
```
1. Connexion/création wallet (self-custody)
2. Lien wallet ↔ session authentifiée (signature de challenge — proof of ownership, anti-usurpation)
3. Screening sanctions/AML on-chain du wallet (§7)  ──[bloquant]──> rejet si "sale"
4. KYC validé (Sumsub/Onfido) → émission claim ONCHAINID (soulbound) par trusted issuer
5. Enregistrement dans IdentityRegistry (pays, éligibilité)  → wallet WHITELISTÉ
6. Souscription possible (deal-by-deal)
7. Évènements de cycle : re-screening périodique, expiration KYC → re-vérification,
   sanction détectée → retrait IdentityRegistry + gel transferts (le DEEP reste maître)
8. Changement de wallet investisseur : nouveau proof of ownership + nouveau claim,
   migration via forcedTransfer contrôlé (4-eyes) + mise à jour DEEP
9. Décès/succession : procédure off-chain (DEEP) → recovery on-chain par agent
```

**Proof of ownership obligatoire** (étape 2) : signature d'un nonce serveur par le wallet, vérifiée côté serveur, pour empêcher qu'un attaquant whiteliste un wallet qu'il ne contrôle pas ou usurpe le wallet d'autrui. `[À FAIRE]`

### 4.4 Recovery & wallet perdu `[ANALYSE]`

Avantage décisif du modèle DEEP-source-of-truth : **un investisseur qui perd l'accès à son wallet ne perd pas sa créance.** Procédure :
1. Ré-authentification forte + re-KYC.
2. Nouveau wallet whitelisté (proof of ownership).
3. `forcedTransfer` (fonction recovery ERC-3643) de l'ancien vers le nouveau wallet par l'agent (4-eyes, event + journal).
4. Mise à jour du registre DEEP.
→ Pas de fonds définitivement perdus, contrairement à un ERC-20 pur. C'est un argument produit **et** un contrôle de risque.

---

## 5. Conformité DORA (Règl. UE 2022/2554)

`[FAIT]` DORA s'applique aux entités financières dont les **PSFP/ECSP** (applicable depuis le 17/01/2025). 5 piliers :

### 5.1 Gouvernance & gestion du risque TIC
- Organe de direction **responsable** du risque TIC (pas délégable intégralement) ; cartographie des actifs et dépendances ; politique de sécurité de l'information.

### 5.2 Gestion, classification & reporting des incidents TIC
- Process de détection/classification (majeur vs significatif) ; **reporting réglementaire** des incidents majeurs à l'autorité (notification initiale, intermédiaire, finale) ; cf. runbook §6.
- Articulation avec **RGPD** (CNIL, 72 h) et **TFR/AML** (Tracfin) — un incident peut déclencher **plusieurs** obligations de notification.

### 5.3 Tests de résilience opérationnelle
- Tests réguliers : vulnerability assessment, scans, **pentests**, et pour les entités significatives **TLPT** (threat-led penetration testing).
- Tests de continuité (failover Supabase/Vercel/CASP), restauration de backups, bascule fournisseur.

### 5.4 Gestion du risque des tiers TIC (le plus structurant ici)
`[FAIT]` La plateforme dépend de **prestataires TIC critiques** :

| Prestataire | Service | Criticité DORA | Exigences contractuelles |
|---|---|:--:|---|
| **Supabase** | DB/Auth/Storage | 🔴 Critique | Clauses DORA, localisation données UE, droit d'audit, plan de sortie, SLA, sous-traitants |
| **Vercel** | Hosting front/API | 🔴 Critique | idem + DDoS/WAF |
| **CASP** (Circle/Monerium) | Stablecoin on/off-ramp | 🔴 Critique | Agrément MiCA, ségrégation, continuité |
| **KYC** (Sumsub/Onfido) | Vérif identité | 🔴 Critique | RGPD, localisation, fiabilité |
| **Custody** (Fireblocks/Tangany) | Clés plateforme | 🔴 Critique | Agrément (BaFin/MiCA), SOC 2, assurance |
| **Tokenisation** (Tokeny/Securitize) | Contrats/registre | 🔴 Critique | Audits, continuité, réversibilité |
| **Séquestre** (notaire/EMI) | Fonds clients | 🔴 Critique | Statut régulé, ségrégation, audit |
| **RPC / chaîne** | Settlement on-chain | 🟠 Important | Redondance multi-provider |
| Resend, Sentry, Langfuse, Upstash, Inngest, Composio | Support | 🟠 Important | Clauses, scoping, no-PII si possible |

- **Registre des prestataires TIC** (modèle DORA) tenu à jour.
- **Clauses contractuelles minimales** DORA (droit d'audit, sous-traitance, plan de sortie/réversibilité, localisation, coopération en cas d'incident).
- **Stratégie de sortie** documentée pour chaque prestataire critique (concentration risk : éviter le lock-in total).

### 5.5 Partage d'information sur les cybermenaces
- Veille (CERT-FR, ISAC finance), partage threat intel, abonnement aux alertes des fournisseurs.

---

## 6. Continuité, résilience & runbook incident

### 6.1 RTO/RPO cibles `[HYPOTHÈSE]` (à valider business/DORA)

| Service | RTO | RPO | Stratégie |
|---|---|---|---|
| Souscription / closing | ≤ 4 h | ≤ 15 min | Failover Vercel, DB PITR Supabase |
| Registre DEEP (source de vérité) | ≤ 1 h | ≈ 0 | Réplication + backups chiffrés hors-site |
| Séquestre (fonds) | dépend du tiers | — | Tiers régulé, procédure manuelle de repli |
| On-chain (mint/transfert) | ≤ 24 h | N/A | Multi-RPC ; le DEEP couvre l'intérim |
| KYC | ≤ 24 h | — | Fournisseur de secours / mode dégradé (pause des nouvelles souscriptions) |

> **Principe de résilience clé :** la **disponibilité légale** (DEEP) prime sur la disponibilité on-chain. Si la chaîne ou le RPC tombe, les droits des investisseurs sont **intacts** (registre off-chain) ; on suspend les transferts, on ne perd rien.

### 6.2 Sauvegardes
- **Supabase PITR** activé + exports chiffrés réguliers stockés hors-site (région UE distincte).
- **Registre DEEP** : backup chiffré + test de restauration trimestriel.
- **Secrets** : sauvegarde du vault (procédure de break-glass) ; clés MPC backupées chez le custodian.
- **Smart contracts** : code source + ABI + adresses + commit hash versionnés (Git + IPFS).

### 6.3 Plan de continuité (BCP)
- Fournisseurs de secours identifiés (KYC, CASP, RPC).
- Mode dégradé : suspendre les **entrées** (nouvelles souscriptions) en gardant la **consultation** + le **reporting** disponibles.
- Communication de crise (statut public, email investisseurs via canal indépendant).

### 6.4 Audit log immuable (transverse) `[À FAIRE]`
- Table `audit_log` **append-only** (pas d'UPDATE/DELETE, RLS lecture restreinte, trigger anti-modification) : `actor`, `action`, `entity`, `entity_id`, `amount`, `tenant_id`, `ip`, `user_agent`, `ts`, `signature`.
- Couvre **tout** flux financier/identité : souscription, déblocage séquestre, mint/burn/forcedTransfer, validation KYC, changement de rôle, accès admin.
- Export vers stockage WORM / Axiom pour conservation longue (preuve réglementaire).

### 6.5 Runbooks incident (extraits)

**RB-1 — Compromission suspectée d'une clé plateforme (A1) [CRITIQUE]**
1. **Pause immédiate** des contrats concernés (kill-switch multi-sig).
2. Révoquer le rôle agent compromis (owner Safe), basculer sur signataires de secours.
3. Geler les transferts ; figer les déblocages séquestre en cours.
4. Investigation forensic (transactions, accès) ; le **DEEP reste la référence** pour reconstituer la cap table.
5. Notifications : DORA (autorité), investisseurs si impact, dépôt de plainte.
6. Post-mortem + rotation complète des clés.

**RB-2 — Fuite du `SUPABASE_SERVICE_ROLE_KEY` ou `JWT_SECRET` (A3/A4)**
1. **Rotation immédiate** de la clé/du secret (invalide toutes les sessions pour JWT_SECRET).
2. Auditer les logs Supabase (accès anormaux cross-tenant).
3. Forcer re-login global ; vérifier l'intégrité des tables financières (audit log).
4. Notifications RGPD/DORA si exfiltration de données confirmée.

**RB-3 — Tentative de fraude au virement (BEC) sur le séquestre (Z5)**
1. Bloquer le déblocage suspect (4-eyes), contacter le séquestre tiers.
2. Vérifier l'IBAN contre la source serveur signée (jamais l'email).
3. Tracer l'origine (DMARC report), alerter les investisseurs si phishing diffusé.

**RB-4 — Wallet sanctionné détecté (AML)**
1. Retrait immédiat de l'IdentityRegistry → gel des transferts pour ce wallet.
2. Gel des distributions ; conservation des preuves.
3. **Déclaration de soupçon Tracfin** (LCB-FT) ; ne pas alerter le client (tipping-off interdit).

**RB-5 — Indisponibilité chaîne/RPC**
1. Basculer sur le RPC secondaire.
2. Si chaîne figée : suspendre les transferts, communiquer, **rappeler que les droits (DEEP) sont intacts**.
3. Réconcilier dès rétablissement (totalSupply ↔ DEEP).

---

## 7. Anti-fraude & screening sanctions / adresses on-chain

### 7.1 Screening identité (KYC/AML) `[FAIT]`
- KYC complet à l'inscription (pièce, selfie liveness, justif. domicile, **origine des fonds**) via Sumsub/Onfido (étude P5).
- Screening **PEP** + **listes de sanctions** (OFAC, UE, ONU, gel des avoirs FR) + **adverse media**.
- Re-screening périodique + à chaque événement (re-souscription, distribution importante).
- Conservation des preuves LCB-FT (durée légale), accès restreint, chiffrement.

### 7.2 Screening on-chain (le différenciateur crypto) `[FAIT]`
- **Avant whitelisting** et **avant chaque on-ramp stablecoin** : analyse du wallet via Chainalysis / TRM Labs / Elliptic :
  - exposition à des **adresses sanctionnées** (OFAC SDN on-chain),
  - exposition **mixers** (Tornado Cash…), **darknet**, **arnaques**, **bridges illicites**,
  - score de risque → seuil de rejet/EDD (enhanced due diligence).
- **Travel Rule (TFR 2023/1113)** : sur tout transfert crypto, transmission des infos émetteur/bénéficiaire via le CASP régulé (Circle/Monerium portent cette conformité — étude P10). `[FAIT]`
- **EURC/EURe uniquement** ; **USDT rejeté** en entrée UE (non MiCA, étude P4/P10/P13). `[FAIT]`

### 7.3 Anti-fraude transactionnelle `[ANALYSE]`
- Détection d'anomalies : multi-comptes (device fingerprint, mêmes coordonnées), velocity (souscriptions anormales), incohérence ticket/profil.
- **Remboursement** : restitution **uniquement** sur l'IBAN/wallet **source vérifié** (anti-cash-out frauduleux).
- 4-eyes sur tout mouvement sortant > seuil.
- Limites de ticket alignées sur la classification investisseur (averti/non-averti, plafonds ECSP — étude P5).

### 7.4 Protection des comptes `[FAIT/À FAIRE]`
- Auth email+mot de passe (✓), `disable_signup=true` (✓ — seul l'admin crée les users, réduit l'enum/creds-stuffing).
- **MFA/2FA** à ajouter pour les actions sensibles (souscription, changement wallet) et **obligatoire** pour les comptes admin/ops. `[À FAIRE]`
- Rate-limit login (anti brute-force) — à câbler sur `/api/auth/login`. `[À FAIRE]`
- Politique de mot de passe forte, détection de credential stuffing, alerte connexion nouvel appareil.

---

## 8. Protection des données (RGPD ∩ sécurité)

`[ANALYSE]` (le détail conformité RGPD relève du dossier juridique/compliance ; ici l'angle sécurité) :
- **Minimisation** : ne stocker que le KYC nécessaire ; PII hors de la chaîne (ONCHAINID = claims hashés). `[FAIT]` design
- **Chiffrement** : au repos (Supabase) + en transit (TLS) ; champs ultra-sensibles (origine des fonds) chiffrés applicativement, clés en vault.
- **Cloisonnement** : RLS multi-tenant (✓), accès PII restreint par rôle, masquage IBAN/PII en UI et logs.
- **Conservation** : durées légales (LCB-FT vs RGPD), purge automatisée (table `leads_rgpd` existe déjà — bon signe).
- **Blockchain & droit à l'effacement** : tension connue → **ne jamais** mettre de PII on-chain ; l'effacement porte sur l'off-chain, le on-chain ne contient que des hashs/pseudonymes. `[FAIT]` design
- **Sous-traitants** : DPA avec chaque prestataire (recoupe DORA §5.4).

---

## 9. MATRICE DES RISQUES (likelihood × impact)

> Échelle **Likelihood** L1 (rare) → L5 (très probable). **Impact** I1 (mineur) → I5 (catastrophique). **Score = L × I**. Priorité : 🔴 P0 (≥15), 🟠 P1 (8–14), 🟡 P2 (≤7). Score **résiduel** = après mitigation.

| ID | Risque | Zone | L | I | Score | Prio | Mitigation principale | Résiduel |
|---|---|---|:--:|:--:|:--:|:--:|---|:--:|
| **R-01** | **Requalification FIA** (dérive vers pooling/discrétion) | Légal/Produit | 3 | 5 | **15** | 🔴 | No pré-collecte, no NAV, choix deal-by-deal réel, séquestre tiers, garde-fous produit (cf. étude) | 6 (🟡) |
| **R-02** | **Compromission clé plateforme on-chain** (A1) | Z4 | 2 | 5 | **10** | 🟠 | MPC/HSM + multi-sig + timelock + 4-eyes ; DEEP = source de vérité (impact borné) | 4 (🟡) |
| **R-03** | **Fuite `SERVICE_ROLE_KEY`** → cross-tenant | Z3 | 2 | 5 | **10** | 🟠 | `process.env` only, gitleaks CI, rotation, RLS defense-in-depth, jamais client | 4 (🟡) |
| **R-04** | **Forge de JWT** (`JWT_SECRET` faible/fuite) | Z2 | 2 | 5 | **10** | 🟠 | Secret ≥256 bits en vault, rotation, vérif claims | 4 (🟡) |
| **R-05** | **Fraude au virement / BEC** sur séquestre | Z5 | 3 | 5 | **15** | 🔴 | IBAN non modifiable côté UI + source serveur signée, DMARC/DKIM/SPF, 4-eyes, séquestre tiers contrôle déblocage | 6 (🟡) |
| **R-06** | **Vol de tokens** (exploit smart contract) | Z4 | 2 | 4 | **8** | 🟠 | 2 audits tiers, invariants, bug bounty, pause ; **créance off-chain non volée** (DEEP) | 3 (🟡) |
| **R-07** | **IDOR / fuite cross-objet** (service-role sans filtre) | Z2/Z3 | 3 | 4 | **12** | 🟠 | Filtre `tenant_id`+`user_id` systématique, `assertOwnership()`, tests IDOR | 4 (🟡) |
| **R-08** | **Fuite PII / KYC** (RGPD) | Z3 | 2 | 5 | **10** | 🟠 | Chiffrement, RLS, minimisation, masquage, DPA, buckets privés | 4 (🟡) |
| **R-09** | **Abus endpoints coûteux (LLM/PDF)** + rate-limit fail-open | Z2 | 4 | 2 | **8** | 🟠 | Rate-limit par user+route, quotas, budget cap ; revoir le **fail-open** sur routes sensibles | 4 (🟡) |
| **R-10** | **Wallet sanctionné / blanchiment** | Z5/KYC | 3 | 4 | **12** | 🟠 | Screening on-chain (Chainalysis/TRM) avant whitelist + on-ramp, Travel Rule, EURC/EURe only, Tracfin | 4 (🟡) |
| **R-11** | **Prompt injection LLM → exfiltration** | Z6 | 3 | 3 | **9** | 🟠 | No secret en contexte, sortie LLM non fiable, allowlist outils, human-in-the-loop | 3 (🟡) |
| **R-12** | **Divergence chaîne ↔ registre DEEP** | Z4/Z3 | 2 | 4 | **8** | 🟠 | DEEP source de vérité, réconciliation `totalSupply`↔DEEP, alertes, recovery forcedTransfer | 3 (🟡) |
| **R-13** | **Indisponibilité prestataire critique** (DORA) | Z6 | 3 | 4 | **12** | 🟠 | Redondance, fournisseurs de secours, mode dégradé, registre TIC + plan de sortie | 4 (🟡) |
| **R-14** | **Insider malveillant** (dev/ops/opérateur) | Z3/Z8 | 2 | 5 | **10** | 🟠 | Moindre privilège, 4-eyes, audit log immuable, séparation prod, secrets vault, revue d'accès | 4 (🟡) |
| **R-15** | **Compromission CI/CD / supply chain npm** | Z8 | 2 | 5 | **10** | 🟠 | Lockfile, `npm audit`, gitleaks, branches protégées, 2FA, builds signés | 4 (🟡) |
| **R-16** | **Upgrade malveillant de contrat (proxy)** | Z4 | 1 | 5 | **5** | 🟡 | Token non-upgradable préféré / timelock+multi-sig si proxy | 2 (🟡) |
| **R-17** | **Usurpation de session / XSS** | Z1 | 2 | 4 | **8** | 🟠 | CSP stricte, httpOnly cookies (✓), escaping React, headers sécurité | 3 (🟡) |
| **R-18** | **Webhook tiers spoofé** (CASP/PSP/KYC) | Z2/Z6 | 3 | 4 | **12** | 🟠 | Signature HMAC/JWS, allowlist IP, idempotency, double-check par pull | 3 (🟡) |
| **R-19** | **Double-souscription / replay** | Z2/Z5 | 3 | 3 | **9** | 🟠 | Idempotency-Key, state machine serveur, réconciliation 3-way | 3 (🟡) |
| **R-20** | **Whitelist d'un wallet non contrôlé** (usurpation) | Z4 | 2 | 4 | **8** | 🟠 | Proof of ownership (signature de nonce) avant whitelisting | 2 (🟡) |
| **R-21** | **DDoS / déni de service** | Z1/Z2 | 3 | 3 | **9** | 🟠 | WAF/CDN (Vercel/Cloudflare), rate-limit, autoscaling | 4 (🟡) |
| **R-22** | **RCE Electron** | Z7 | 1 | 4 | **4** | 🟡 | contextIsolation, sandbox, nodeIntegration off, IPC validé, no remote content | 2 (🟡) |
| **R-23** | **Phishing investisseur** (faux site/wallet) | externe | 4 | 4 | **16** | 🔴 | Éducation, DMARC, monitoring de domaines look-alike, signatures claires, jamais demander la seed | 8 (🟠) |
| **R-24** | **Perte d'accès wallet investisseur** | Z4 | 3 | 2 | **6** | 🟡 | Recovery via DEEP + forcedTransfer (créance jamais perdue) | 2 (🟡) |

### 9.1 Top priorités d'exécution (P0 brut → à traiter en premier)
1. **R-23 Phishing** (16) — le risque externe le plus probable en crypto retail : anti-spoofing email (DMARC strict), monitoring domaines look-alike, pédagogie « jamais la seed ».
2. **R-01 Requalification FIA** (15) — gouverne tout le produit (garde-fous structurels, cf. étude) ; sécurité = enforcement technique du « no pooling / no discrétion ».
3. **R-05 Fraude au virement** (15) — IBAN séquestre verrouillé côté serveur, DMARC, 4-eyes.
4. **R-07 IDOR / service-role** (12), **R-10 AML on-chain** (12), **R-13 dépendances DORA** (12), **R-18 webhooks** (12) — chantiers techniques prioritaires.

---

## 10. Conformité des contrôles au cadre verrouillé (rappel)

| Contrainte verrouillée | Contrôle sécurité correspondant |
|---|---|
| Plateforme ne détient jamais les fonds | Séquestre tiers contrôle le déblocage (§2.5, §4.1) ; pas de honeypot de fonds |
| Pas de pooling / NAV / rebalancing (anti-FIA) | State machine deal-by-deal, no pré-collecte technique, audit log prouvant le choix réel (R-01) |
| ERC-3643, jamais ERC-4626 | Standard imposé §3 ; ERC-4626 banni (signal FIA) |
| DEEP = source de vérité, chaîne = miroir | Réconciliation, recovery, impact exploit borné (§2.4, §4.4, R-12) |
| EURC/EURe via CASP, jamais USDT | Screening on-ramp, Travel Rule, rejet USDT (§7.2, R-10) |
| Tokens `--ct-*` only (Cockpit) | N/A sécurité (design) — pas de secret dans le front |
| Multi-tenant Supabase RLS | §2.3 durcissement, R-03/R-07/R-14 |

---

## 11. Backlog sécurité priorisé (artefacts à produire)

> Ordre = priorité décroissante. `[FAIT]` = déjà dans le repo.

**P0 (avant tout flux financier réel)**
1. Anti-spoofing email complet (DMARC `reject`, DKIM, SPF) + monitoring domaines look-alike (R-23, R-05).
2. Verrouillage IBAN séquestre côté serveur + 4-eyes sur déblocage (R-05).
3. Inventaire + enforcement filtre `tenant_id`/`user_id` sur **chaque** appel service-role + helper `assertOwnership()` (R-07, R-03).
4. CSP stricte + headers de sécurité (next.config / middleware) (R-17).
5. Custody plateforme MPC/HSM + Safe multi-sig + séparation des rôles (R-02).
6. 2 audits smart contract tiers + invariants (Foundry/Slither/Echidna) + bug bounty (R-06, R-16).
7. Audit log append-only signé sur tout flux financier/identité (§6.4).
8. gitleaks pre-commit + CI ; rotation `JWT_SECRET`/service-role ; `get_advisors` en gate (R-15, R-03, R-04).

**P1**
9. Screening on-chain (Chainalysis/TRM) avant whitelist + on-ramp + Travel Rule (R-10).
10. Idempotency-Key + state machine serveur + réconciliation 3-way sur souscription/closing/mint (R-19).
11. Vérif signature HMAC/JWS sur tous webhooks tiers + allowlist IP + idempotency (R-18).
12. Proof of ownership wallet (signature de nonce) avant whitelisting (R-20).
13. MFA/2FA actions sensibles + admin ; rate-limit login (R-23, brute-force).
14. Registre prestataires TIC DORA + clauses contractuelles + plans de sortie (R-13).
15. Durcir le rate-limit (revoir fail-open sur routes sensibles), quotas/budget LLM (R-09).
16. Buckets Storage privés + signed URLs courtes + RLS Storage par tenant (R-08).

**P2**
17. pgaudit sur tables financières ; export WORM/Axiom.
18. Hardening Electron (revue contextIsolation/sandbox/IPC) (R-22).
19. Garde-fous prompt injection LLM (allowlist outils, isolation contexte) (R-11).
20. Pentest tiers + (si entité significative) TLPT DORA.
21. Tests de continuité (failover, restauration backups, bascule fournisseur).

---

## 12. Incertitudes & dépendances

- **`[HYPOTHÈSE]`** Choix custodian (Fireblocks vs Tangany vs Safe+MPC) et chaîne (Base/Polygon/permissionné) → à trancher avec le dossier **05-smart-contracts** et l'agent de tokenisation.
- **`[HYPOTHÈSE]`** RTO/RPO et seuils de ticket/4-eyes → à valider avec le business et la lecture DORA par un cabinet.
- **`[HYPOTHÈSE]`** Périmètre exact « entité significative » DORA (déclenche le TLPT) → dépend de la taille → conseil réglementaire.
- **Dépendances inter-dossiers :**
  - **05-smart-contracts** : invariants (§3.2), rôles/upgrade (§3.1), chaîne (§3.4) — ce dossier en fixe les exigences sécurité.
  - **06-migrations** : tables `audit_log`, `kyc_records`, `escrow_movements`, `token_events`, RLS, pgaudit (§2.3, §6.4) — à implémenter conformément.
  - **07-moteur-financier** : réconciliation 3-way (montant↔séquestre↔token), waterfall — contrôles d'intégrité (§2.2).
  - Dossier **juridique/compliance** : RGPD détaillé, LCB-FT, statut PSFP/CASP — recoupe §5, §7, §8.
- **À valider par tiers :** pentest (Z1/Z2), 2 audits smart contracts (Z4), revue DORA (cabinet), DPA RGPD (sous-traitants).

---

*Fin du dossier 09 — Sécurité, Custody & Risk. Ce plan est exécutable (backlog §11) et borné par le cadre réglementaire verrouillé. Aucune mise en prod sans pentest + audits smart contracts tiers + revue DORA.*
