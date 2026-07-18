# REA-LIVE-009 — Activation GPU1 (état réel)

> Migrations appliquées sur GPU1 le 2026-07-18 après autorisation explicite du propriétaire.
> Aucune donnée métier modifiée. Aucun secret dans ce document.

## État constaté AVANT (interrogé, non supposé)
- `0043` appliquée (`rea_tasks` présente), `0047` appliquée (RLS prospection active sur
  `prosp_annonces`/`prosp_config`/`prosp_matchs`/`prosp_prospects`).
- Fonctions présentes : `current_tenant_id`, `verify_login`, `custom_access_token_hook`, `set_updated_at`.
- Extensions : `pgcrypto`, `plpgsql`, `uuid-ossp`.
- 64 tables. **Absentes** : toutes les tables de `0044`, `0045`, `0049`→`0058`, et l'index de `0046`.

## Migrations appliquées (14, dans l'ordre, `ON_ERROR_STOP=1`, transaction individuelle)
`0044 0045 0046 0048 0049 0050 0051 0052 0053 0054 0055 0056 0057 0058` — **14/14 OK**.

## Objets créés
`agent_gateway_audit_log`, `agent_gateway_idempotency_keys`, `agent_alert_approvals`
(+ colonnes `decided_at`/`decided_by`, trigger `trg_agent_alert_approval_updated_at`),
`outbox_drafts`, `visit_reports`, `offmarket_selections`, `offmarket_selection_items`,
`offmarket_feedback`, `reactivation_log`, `post_visit_signals`, `mandate_renewal_proposals`,
`share_events`, `value_snapshots`, `learning_signals`, index `idx_auth_credentials_tenant`.

## Intégrité des données métier (avant → après)
`leads=12 → 12` · `properties=9 → 9` · `mandates=5 → 5` · `visits=5 → 5` ·
`estimations=10 → 10` · `rea_tasks=4 → 4` · `users=1 → 1` — **identiques**.

## Vérification d'accessibilité
- Cache PostgREST rechargé (`SIGUSR1`).
- 12 tables interrogées via PostgREST → **HTTP 200**.
- Écriture réversible prouvée (INSERT 201 → DELETE 204) sur : `outbox_drafts`, `share_events`,
  `visit_reports`, `post_visit_signals`, `mandate_renewal_proposals`, `reactivation_log`.

## Sauvegarde (sur l'hôte GPU1, jamais dans Git)
`gpu1:~/rea-backups/rea-pre-009-<timestamp>.dump` — format custom, `pg_restore --list` OK
(843 entrées, 6 tables métier avec données).

## Rollback
Ciblé (tables neuves uniquement, données métier non concernées) :
```
DROP TABLE IF EXISTS learning_signals, value_snapshots, share_events,
  mandate_renewal_proposals, post_visit_signals, reactivation_log,
  offmarket_feedback, offmarket_selection_items, offmarket_selections,
  visit_reports, outbox_drafts, agent_alert_approvals,
  agent_gateway_idempotency_keys, agent_gateway_audit_log CASCADE;
```
Restauration totale — **le dump réside sur l'hôte GPU1**, la commande s'exécute donc côté GPU1
(pas de redirection depuis un poste distant), et **exige une nouvelle autorisation explicite** :
```
ssh gpu1
docker exec -i nexus-postgres pg_restore -U postgres -d real-estate-agent --clean --if-exists \
  < ~/rea-backups/rea-pre-009-<timestamp>.dump
```
