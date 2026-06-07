# Smart contracts — Security token ERC-3643 pour obligations de SPV

> Implémentation Solidity **réelle, compilable et testée (Foundry)** du *security
> token* permissionné représentant les **obligations** émises par une SAS
> opérationnelle (marchand de biens / promotion), 1 SPV = 1 opération.
>
> Ce module est le **bras on-chain** du montage décrit dans
> [`docs/etude-immobilier-tokenise-2026.md`](../../etude-immobilier-tokenise-2026.md).
> Il en applique les contraintes **verrouillées** : ERC-3643 (jamais ERC-4626),
> KYC obligatoire, lock-up, restriction de juridiction, plafond d'investisseurs,
> règlement EURC (jamais USDT), miroir d'un registre légal **DEEP** qui reste la
> **source de vérité juridique**.

---

## 0. TL;DR — ce qui est livré

| Brique | Fichier | Rôle |
|---|---|---|
| **Security token** | `src/token/SecurityToken.sol` | ERC-3643 : ERC-20 + transferts gardés (KYC + compliance), mint/burn, forcedTransfer/clawback, gel, pause, recovery, **référence DEEP** |
| **Identity Registry** | `src/registry/IdentityRegistry.sol` | `isVerified()` — le **KYC obligatoire** : croise ONCHAINID × topics requis × trusted issuers |
| **Identity Storage** | `src/registry/IdentityRegistryStorage.sol` | stockage partageable wallet → (ONCHAINID, pays) |
| **Claim Topics** | `src/registry/ClaimTopicsRegistry.sol` | topics de claim exigés (KYC, éligibilité, pays) |
| **Trusted Issuers** | `src/registry/TrustedIssuersRegistry.sol` | liste blanche des émetteurs de claims (prestataires KYC) |
| **Modular Compliance** | `src/compliance/ModularCompliance.sol` | orchestrateur des règles métier (`canTransfer`) |
| **Module lock-up** | `src/compliance/modules/LockUp24Module.sol` | inaliénabilité 24 mois jusqu'à l'exit |
| **Module juridiction** | `src/compliance/modules/CountryRestrictModule.sol` | exclusion de pays (US sans Reg S, sanctions) |
| **Module plafond** | `src/compliance/modules/MaxInvestorsModule.sol` | < 150 investisseurs/État (anti offre au public) |
| **Module KYC** | `src/compliance/modules/KycRequiredModule.sol` | KYC obligatoire (ceinture + bretelles) |
| **Distribution** | `src/distribution/BondDistributor.sol` | coupon + remboursement du principal en **EURC**, burn à l'exit |
| **ONCHAINID** | `src/identity/IIdentity.sol` | interfaces ERC-734/735 + IClaimIssuer |
| **Déploiement** | `script/DeploySPV.s.sol` | déploie + câble toute la stack (proxies) pour une SPV |
| **Tests** | `test/*.t.sol` | **42 tests** Foundry (invariants conformité, agent, distribution, upgrade, fuzz) |

**État : 42 tests passent (`forge test`).**

---

## 1. Articulation réglementaire — hors-MiCA / MiFID II / DEEP

C'est le point juridique central. Il gouverne **pourquoi** le code est fait ainsi.

### 1.1 Le token est un instrument financier MiFID II → **hors MiCA**
- [FAIT] Le *security token* représente une **obligation** (titre de créance,
  art. **L.211-1 CMF**). C'est un **instrument financier** au sens de **MiFID II**.
- [FAIT] **MiCA art. 2(4)** exclut explicitement les instruments financiers de son
  champ. Le token **ne relève donc pas de MiCA** ; il relève de
  **MiFID II / Prospectus / DEEP / (DLT Pilot pour un marché secondaire organisé)**.
- [ANALYSE] C'est exactement pour cela qu'on utilise **ERC-3643** (token financier
  permissionné) et **jamais ERC-4626** : un vault ERC-4626 (parts d'un pool géré
  rachetables) serait lu par l'ESMA comme une « unité d'OPC » → **signal FIA**
  (cf. étude P9, P13). Le code n'expose **aucune** mécanique de pooling/NAV/rachat.

### 1.2 Ce qui relève de MiCA, c'est le **stablecoin de règlement**
- [FAIT] **EURC** (Circle, EMT, agréé ACPR) / **EURe** (Monerium, EMI) sont des
  *e-money tokens* **MiCA-conformes**. Le `BondDistributor` règle en **EURC**.
- [FAIT] **USDT** est **non conforme MiCA** (delisté UE depuis Q1 2025) : le code
  ne le manipule jamais ; `SETTLEMENT_TOKEN` doit être un EMT régulé.

### 1.3 Le **DEEP** est la source de vérité, le token est un **miroir**
- [FAIT] **Ord. 2017-1674 + Décret 2018-1226** : l'inscription d'un titre financier
  non coté en DLT (**DEEP** : dispositif d'enregistrement électronique partagé)
  **vaut inscription en compte-titres**. Possible **uniquement** pour des titres
  de sociétés **par actions** (SAS) → cohérent avec le montage « obligations de SAS ».
- [ANALYSE] **Choix d'architecture** : le registre **légal** (DEEP, tenu par le
  registrar/agent de tokenisation) **prime** juridiquement. Le token on-chain en
  est le **reflet opérationnel**. En cas de divergence (succession, décision de
  justice, erreur), l'agent **re-synchronise** le on-chain sur le DEEP via
  `forcedTransfer` / `recoveryAddress`. Le token porte explicitement la référence
  du registre légal :
  - `SecurityToken.isin()` → ISIN/identifiant DEEP,
  - `SecurityToken.legalRegistryURI()` → pointeur vers le registre légal,
  - `SecurityToken.onchainID()` → ONCHAINID de l'émetteur (la SPV).

### 1.4 Anti-FIA — traduction technique des verrous de l'étude
| Verrou étude (AMF SAN-2025-08, AIFMD) | Traduction dans le code |
|---|---|
| **Aucune pré-collecte / pooling** | `BondDistributor` ne possède **aucune** fonction de dépôt de capital investisseur. Le **seul** flux entrant EURC est `fundRound` (réservé à l'agent, sens **SPV → investisseurs**). Le closing/séquestre est **off-chain** (notaire/EMI). |
| **Aucune NAV globale / rebalancing** | Aucun calcul de valeur de part, aucun `convertToShares`/`convertToAssets`, aucun rééquilibrage. 1 token = 1 fraction d'**une** émission d'**une** SPV. |
| **Choix deal-by-deal réel** | 1 déploiement = 1 SPV = 1 opération. Chaque token est un contrat distinct ; l'investisseur souscrit **un** deal précis. Pas de contrat « fonds » agrégeant des deals. |
| **La plateforme ne détient jamais les fonds** | Aucun contrat ne custody les EUR clients ; le règlement primaire passe par le **séquestre tiers** off-chain. Le `BondDistributor` ne fait que **redistribuer** un remboursement déjà décidé. |

> ⚠️ **Limite [HYPOTHÈSE]** : la non-qualification FIA est **casuistique** et
> repose d'abord sur le **montage juridique réel** (objet commercial de la SPV,
> gouvernance, rôle de la plateforme), pas sur le code. Le code **n'introduit
> aucun** signal FIA, mais ne **suffit pas** à lui seul à écarter le risque :
> validation avocat AIFM indispensable (cf. étude P15).

---

## 2. Architecture des contrats

```
                ┌──────────────────────────────────────────────┐
                │  ClaimTopicsRegistry   TrustedIssuersRegistry │
                │  (topics requis)       (KYC issuers de conf.) │
                └───────────────┬───────────────┬──────────────┘
                                │               │
                    ┌───────────▼───────────────▼──────────┐
   IdentityRegistry │  isVerified(wallet) = KYC OBLIGATOIRE │◄── ONCHAINID
   Storage ────────►│  (croise identité × topics × issuers) │    (claims KYC,
   (wallet→ONCHAINID│                                        │     soulbound)
    + pays)         └───────────────────┬────────────────────┘
                                        │  (1) KYC du destinataire
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │                    SecurityToken (ERC-3643)                 │
        │  transfer / transferFrom  ──► garde (1) isVerified(to)      │
        │                            ──► garde (2) compliance.canXfer │
        │  mint/burn/forcedTransfer/freeze/pause/recovery (AGENT)     │
        │  isin()/legalRegistryURI()  ── MIROIR du registre DEEP      │
        └───────────────┬─────────────────────────────┬──────────────┘
                        │ (2) règles métier             │ distribution
                        ▼                               ▼
        ┌───────────────────────────────┐   ┌──────────────────────────┐
        │      ModularCompliance         │   │     BondDistributor       │
        │  canTransfer = AND(modules)    │   │  rounds coupon/principal  │
        │  ┌──────────┬──────────────┐   │   │  réglés en EURC (pull)    │
        │  │ LockUp24 │ CountryRestr.│   │   │  burn des tokens à l'exit │
        │  ├──────────┼──────────────┤   │   └──────────────────────────┘
        │  │ MaxInvest│ KycRequired  │   │
        │  └──────────┴──────────────┘   │
        └────────────────────────────────┘
```

### Le chemin d'un transfert (cœur de la conformité)
`SecurityToken._transferChecked(from, to, amount)` applique, dans l'ordre :
1. **Gel** : `from`/`to` non gelés ; solde **libre** (hors gel partiel) suffisant.
2. **KYC** : `identityRegistry.isVerified(to)` — sinon `revert NotVerified`.
   *(C'est l'invariant testé : un transfert vers un wallet non-KYC échoue.)*
3. **Compliance métier** : `compliance.canTransfer(from, to, amount)` = ET logique
   de tous les modules (lock-up **ET** pays **ET** plafond **ET** KYC redondant).
4. **Effets** + `compliance.transferred(...)` (mise à jour des compteurs holders).

---

## 3. Rôles & gouvernance

| Rôle | Qui | Pouvoirs |
|---|---|---|
| **OWNER** (2-step) | Board légal du token : **multisig de la SAS émettrice** / agent Tokeny | gère les agents, **upgrades UUPS**, bindings registries, métadonnées, **référence DEEP**, plafonds/lock-up/pays via la compliance |
| **AGENT** | Transfer agent / relais KYC | `mint`/`burn` (souscription/exit), `forcedTransfer`/clawback, `freeze`, `pause`, `recovery`, enregistrement d'identités, création/financement des rounds de distribution |

- **Transfert de propriété en 2 étapes** (`transferOwnership` → `acceptOwnership`)
  pour éviter une perte de contrôle vers une adresse morte.
- **Pause** : circuit-breaker de conformité (gel global on-chain sur instruction
  émetteur/AMF/incident). N'éteint **pas** les droits légaux du créancier (portés
  par le DEEP).

---

## 4. forcedTransfer / clawback — usages légitimes & bornés

`forcedTransfer` et `recoveryAddress` déplacent des tokens **sans** consentement du
porteur. C'est **indispensable** pour un titre financier régulé, et **borné** :

- **Usages** : décision de justice / saisie ; **succession** ; réalisation d'un
  **nantissement** (titres nantis au profit des obligataires, étude P11) ;
  **re-synchronisation** du on-chain sur le DEEP ; récupération d'un wallet perdu.
- **Garde-fou** : le destinataire d'un `forcedTransfer`/`recovery` **doit rester
  KYC** (`isVerified`). On ne clawback **jamais** vers un wallet non éligible.
- `recoveryAddress` exige que le nouveau wallet soit rattaché à la **même
  ONCHAINID** que le wallet perdu (vérifié dans l'IdentityRegistry).

---

## 5. Distribution (coupon + principal en EURC)

`BondDistributor` — modèle **pull par rounds figés (snapshot)** :
1. `createRound(kind, totalAmount, supplySnapshot)` (agent) — `Coupon` ou `Principal`.
2. `setSnapshotBatch(roundId, holders, balances)` (agent) — fige la cap table à T.
3. `fundRound(roundId)` (agent) — dépose les EURC (la SPV a approuvé le contrat).
4. `claim(roundId)` (holder) **ou** `claimFor` (agent, pour wallets *embedded*) —
   part = `soldeFigé × totalAmount / supplySnapshot`.
5. À l'exit : round `Principal` puis `SecurityToken.burn(...)` (sortie).

Sécurités : `nonReentrant`, EURC transféré **en dernier**, **refus de payer un
wallet gelé** (conformité), `sweepUnclaimed` vers consignation/séquestre pour les
reliquats. **Aucun** chemin d'entrée de capital investisseur (anti-FIA).

---

## 6. Upgradeabilité

- Modèle **T-REX** : chaque registry + le token + le distributeur sont déployés
  derrière un **proxy ERC-1967** (`src/vendor/ERC1967Proxy.sol`) ; la logique
  d'upgrade est **UUPS** (`src/vendor/UUPSUpgradeable.sol`), gardée par
  `_authorizeUpgrade` = **onlyOwner**.
- **Storage namespacé ERC-7201** partout (slots calculés réellement, cf. constantes
  `*_STORAGE`) → pas de collision lors d'un upgrade.
- Les **modules** de compliance ne sont **pas** proxiés (déployés une fois,
  branchables sur N compliances) ; on en redéploie une nouvelle version et on
  `removeModule`/`addModule` si besoin.

---

## 7. Pourquoi pas de remappings / dépendances externes pour le code de prod

Tout l'écosystème (token + registries + compliance + proxy + primitives
type-OpenZeppelin : `Ownable2Step`, `Pausable`, `ReentrancyGuard`, `SafeERC20`,
`Initializable`) est **vendoré** sous `src/vendor/` et `src/`. **Le code de
production ne dépend d'aucune librairie externe** — auditabilité maximale,
reproductibilité, pas de surface d'attaque supply-chain.

Seule la **suite de tests** utilise `forge-std` (cheatcodes Foundry). Installer :

```bash
forge install foundry-rs/forge-std --no-git
```

> N.B. : pour un déploiement **mainnet** réel, il est recommandé de remplacer les
> primitives vendorées par les implémentations **OpenZeppelin auditées** et le
> standard **T-REX officiel (TokenySolutions/T-REX)** — l'API a été tenue
> volontairement **compatible** pour faciliter cette substitution. Le code ici est
> conçu pour être **lisible, testable et fidèle au standard**, pas pour remplacer
> un audit tiers.

---

## 8. Commandes

```bash
# Compiler
forge build

# Lancer tous les tests (42)
forge test -vv

# Un fichier précis
forge test --match-path test/ComplianceInvariants.t.sol -vv

# Couverture
forge coverage

# Déploiement (simulation puis broadcast)
cp .env.example .env   # renseigner les variables
source .env
forge script script/DeploySPV.s.sol:DeploySPV --sender $OWNER_ADDRESS          # dry-run
forge script script/DeploySPV.s.sol:DeploySPV --rpc-url $RPC_URL --broadcast \
  --private-key $DEPLOYER_PK
```

---

## 9. Couverture de tests (invariants de conformité)

`test/ComplianceInvariants.t.sol` encode les règles réglementaires :
- **KYC obligatoire** : transfert/mint vers wallet **non-KYC** → **revert** (invariant demandé).
- **Lock-up** : transfert secondaire avant l'échéance → **revert** ; mint/burn permis.
- **Juridiction** : transfert vers résident d'un pays restreint (US) → **revert**.
- **Plafond** : dépassement du nombre max d'investisseurs → **revert** ; décrément correct.
- **Révocation KYC** : un claim révoqué rend le wallet non vérifié → réception bloquée.

`test/AgentOperations.t.sol` : contrôle d'accès agent/owner, mint/burn (+ dégel
auto à l'exit), forcedTransfer (bypass lock-up mais KYC requis), gel total/partiel,
pause, recovery (même ONCHAINID), ownership 2-step, référence DEEP.

`test/Distribution.t.sol` : coupon pro-rata, double-claim refusé, claim avant
funding refusé, **refus de payer un wallet gelé**, remboursement principal + burn
(exit complet), sweep vers consignation, **absence de chemin de pré-collecte**.

`test/Upgradeability.t.sol` : upgrade UUPS conserve le storage (soldes + ISIN
DEEP), **owner only**, rejet d'une implémentation non-UUPS, initializers désactivés
sur l'implémentation.

`test/Fuzz.t.sol` : invariant KYC sous fuzzing, conservation comptable
(supply + somme des soldes), gel ≤ solde.

---

## 10. Mapping étude → code

| Étude | Implémentation |
|---|---|
| P9 — ERC-3643, `isVerified()`+`canTransfer()`, ONCHAINID, hors MiCA | toute la stack `src/` |
| P9 — EURC/EURe jamais USDT | `BondDistributor` (settlement token paramétrable, EURC) |
| P5 §2/§11 §15 — KYC, lock-up, burn à l'exit | modules + `mint`/`burn` |
| P6 — badges « Lock-up 24 mois », « Senior secured », « Distribution variable » | `LockUp24Module`, distribution sans taux garanti |
| P7 — fiche : ISIN, registre DEEP, restrictions de transfert | `setLegalRegistryReference`, modules |
| P10 — séquestre tiers, pas de détention des fonds | aucun custody on-chain ; distribution sortante uniquement |
| P11 — nantissement, sûretés | `forcedTransfer` (réalisation de sûreté / sync DEEP) |
| P13 — < 150 investisseurs/État, juridictions | `MaxInvestorsModule`, `CountryRestrictModule` |
| Recadrages anti-FIA | pas d'ERC-4626, pas de pooling/NAV/rachat ; 1 SPV = 1 token |

---

*Avertissement : ce code est une implémentation de référence, sourcée sur l'étude
jointe. Il ne constitue pas un conseil juridique. Tout déploiement réel requiert un
audit de sécurité tiers et la validation d'un avocat en droit financier (AIFM /
MiFID / MiCA) et d'un agent de tokenisation/registrar DEEP.*
