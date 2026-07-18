# AGENTIC OPPORTUNITIES — REA-GAMECHANGER-005

> Ce que des agents EXTERNES (LangGraph via le runtime Aigent) et l'assistant Cockpit peuvent réellement
> exécuter sur l'infrastructure DÉJÀ construite — observable, auditable, réversible, HITL. Source :
> `reports/opus-06.md` (inventaire gateway complet) + arbitrage opus-10. AUCUN moteur agent interne,
> AUCUN faux run : tout passe par la gateway et le runtime feature-détecté existants.

## 1. L'actif déjà payé (vérifié dans le code)

- **Gateway `app/api/agent-gateway/v1/**` — 15 routes** : `listings.collect/normalize`,
  `buyers.list/get-profile/update-preferences`, `matching.compute/persist`, `alerts.prepare/dispatch`,
  `crm.create-lead/create-property/create-visit/create-mandate`, `valuations.get/update-interview`.
- **Sécurité déjà durcie** : auth par clé, scopes, délégation, **idempotence** (`agent_gateway_idempotency_keys`),
  **audit complet** (`agent_gateway_audit_log` — persisté mais SANS UI), **approbations HITL fail-closed**
  (`agent_alert_approvals`, migration 0045).
- **Runtime Aigent** (`lib/aigent/runtime.ts`, server-only, feature-détecté `AIGENT_*`) + proxy
  `app/api/aigent/**` + page `/agents` (registre, RunTracker, resume HITL sur `swarm_runs`).
- **Assistant Cockpit** : 25 tools OpenAI function-calling, HITL dur sur mutations destructives.
- **Inngest** (`app/api/inngest/route.ts`) : déclencheurs cron server-side disponibles.

## 2. L'état honnête (pourquoi c'est muet aujourd'hui)

| Verrou | Fait vérifié | Levée |
|---|---|---|
| `alerts.dispatch` répond **DENIED** | Migration **0045 non déployée sur gpu1** + aucun flux humain de création/validation d'approbation | Déployer 0045 (ops, 15 min) + **Centre d'approbation (#3)** |
| Registre Aigent **vide** | Aucun agent externe publié ; le runtime ne fabrique jamais de run | Publier le 1er agent réel (Vigie) APRÈS #3 |
| Audit invisible | `agent_gateway_audit_log` écrit, aucune UI | Onglet Journal dans `/agents` (fusionné dans #3) |
| Signaux collectés jamais lus | `prosp_annonce_versions`, `scoreMandat` sans consommateur | Radar (#1) — consommateur humain d'abord, agent ensuite |

## 3. La chaîne agentique retenue (prepare → approve → dispatch)

**C'est LE pattern différenciant** — consensus US 2026 (Rechat Lucy « feu vert final », Lofty Homeowner
Agent avec handoff humain), absent du marché FR, et le serveur Azigo l'implémente déjà. Il manque les
surfaces produit :

1. **Centre d'approbation (#3, M)** — file create→approve→reject sur `agent_alert_approvals` + Journal
   d'audit. Chaque action d'agent est : observable (journal), auditable (idempotency+audit), réversible
   (rien ne part sans approbation), HITL (approbation explicite). Débloque l'envoi réel (Resend branché).
2. **Agent Vigie vendeurs (nocturne)** — V1 **cron Inngest interne** (aucune dépendance registre) : scanne
   `prosp_annonce_versions` (baisses, stagnations, republications, retraits), score `scoreMandat`, pose des
   `rea_tasks` + prépare des alertes via `alerts.prepare` → approbation humaine → dispatch. V2 : le même
   flux porté par un **agent LangGraph externe** via la gateway (`listings`, `matching.compute`,
   `alerts.prepare`), visible dans `/agents` avec runs réels. Démo : « pendant la nuit, 7 opportunités
   détectées, 3 envois proposés, vous en approuvez 2 ».
3. **Boîte de sortie (#4)** — le canal HITL de TOUTE communication : l'IA rédige (relance, CR vendeur,
   réactivation), l'humain valide, le brouillon part en Gmail (Composio `GMAIL_CREATE_EMAIL_DRAFT`, seul
   canal sortant LIVE vérifié). Jamais d'envoi autonome.
4. **Tools chat signaux (#1-compagnon)** — `list_mandate_opportunities` + `prepare_seller_contact` dans le
   registre de l'assistant : le Cockpit sait répondre « quelles opportunités ce matin ? » et préparer un
   contact (brouillon, HITL conservé).
5. **Off-market push (#2)** et **Sélection acquéreur (#6)** — préparables par agent (matching.compute →
   liste), l'envoi restant humain/approuvé.

## 4. Extensions gateway qui débloqueraient le plus (tailles S, additives)

Constat opus-06 : la gateway couvre les CRÉATIONS CRM et le pipeline prospection, mais pas :
- `tasks.create` (un agent ne peut pas poser une `rea_task` via la gateway — la Vigie V2 en a besoin) ;
- `leads.update` (qualification post-visite par agent → aujourd'hui création seulement) ;
- `comm.drafts.create` (déposer un brouillon dans la Boîte de sortie #4 — le chaînon agent→HITL humain).
Chacune = route additive + scope + contrat + tests, pattern existant à copier. À inscrire dans la mission
d'implémentation M1/M2, PAS des refontes.

## 5. Séquence d'activation (ne pas inverser)

1. **Déployer 0045** (ops gpu1, hors de ce run) → `alerts.dispatch` cesse d'être DENIED.
2. **#3 Centre d'approbation + Journal** → la chaîne HITL a une surface humaine.
3. **#1 Radar + Vigie V1 (cron interne)** → le premier « agent » crée de la valeur SANS dépendre du
   registre Aigent (zéro faux run).
4. **#4 Boîte de sortie** → toutes les communications agentiques ont leur canal validé.
5. **Vigie V2 en agent LangGraph externe** publié au registre → `/agents` montre des runs réels,
   RunTracker et resume HITL prennent vie.
6. Ensuite seulement : qualificateur de leads entrants, « lancer un agent depuis la fiche », cron produit
   réglable (opus-06 C4/C5/C6 — prématurés tant que le registre est vide, voir REJECTED-IDEAS).

## 6. Garde-fous (non négociables, hérités du code existant)

- Toute mutation sensible = approbation explicite (`agent_alert_approvals` fail-closed).
- Toute communication = brouillon ou approuvée ; respect `prosp_optout` ; jamais de PII dans les liens publics.
- Idempotence sur toute écriture agent (clés existantes) ; audit systématique ; runs visibles/rejouables.
- Le modèle ne reçoit jamais le service-role ; données métier = non fiables (anti prompt-injection).
