# Module Estimation — opérations & modes providers

Avis de valeur immobilier : moteur de valorisation déterministe adossé aux
données publiques françaises, entretien IA d'aide à la saisie, PDF et partage
public sécurisé. DB = Postgres self-host gpu1 (PostgREST). Voir aussi
[DEPLOYMENT.md](DEPLOYMENT.md).

## Pipeline de valorisation (déterministe)

`lib/estimation/` — le calcul de valeur est une fonction **pure** (`computeValuation`),
rejouable, sans IO ni aléatoire. L'IA n'intervient JAMAIS dans le calcul de la valeur.

1. Validation du bien + normalisation d'adresse
2. Géolocalisation (BAN `api-adresse.data.gouv.fr`)
3. Parcelle cadastrale (IGN `apicarto.ign.fr`, résolue par bbox)
4. Transactions DVF (`app.dvf.etalab.gouv.fr`) — filtres qualité : `nature_mutation = 'Vente'`,
   exclusion des ventes en bloc multi-lots (double comptage prix/m²), dédup, NaN
5. Sélection des comparables (type, pièces ±1, surface ±25 %, fenêtre 24→36 mois),
   trim des prix/m² atypiques (P10–P90)
6. Indexation temporelle des comparables (série nationale base 100)
7. Prix/m² de référence = médiane des comparables indexés
8. Ajustements multiplicatifs (DPE, étage, état, standing, exposition/vue, occupation…),
   clamp total ±25 % + annexes en € absolu (parking/cave/piscine/terrasse/jardin)
9. Valeur centrale, intervalle (spread selon confiance), score de confiance

### Version du moteur & auditabilité

`ENGINE_VERSION` (`lib/estimation/valuation.ts`) est persistée avec chaque
estimation (`estimations.engine_version`) + `valued_at`, `quality_alerts`,
`data_status` (`complete|partial|degraded`) — migration `0038`. Toute estimation
est ainsi rattachable à la méthode qui l'a produite.

**Garde anti-écrasement** : une estimation `archived` ne peut être recalculée
(409). Le recalcul d'une estimation `ready` est autorisé mais loggé (plus de
perte silencieuse) ; `?force=true` explicite pour lever toute ambiguïté.

### Score de confiance (serveur, déterministe)

3 niveaux (`indicative`/`moyenne`/`elevee`) pilotant le spread d'intervalle,
enrichis de facteurs mesurables exposés (`confidenceFactors`) : nombre de
comparables, coefficient de variation des prix/m², distance et récence moyennes.

## Modes providers (dégradation propre)

Toutes les sources publiques sont **sans clé**. Chacune dégrade indépendamment
sans bloquer l'estimation :

| Source | Opérationnel | Absent / erreur |
|---|---|---|
| Géocodage BAN | coordonnées + INSEE | **seul bloquant** → estimation `degraded`, valeur indicative |
| Cadastre IGN | parcelle/section | fallback bbox seule, on continue |
| DVF Etalab | comparables réels | 0 comparable → confiance `indicative`, on persiste |
| ADEME DPE | ajustement DPE | ignoré, valorisation sans DPE (confiance abaissée) |

Timeout borné par requête (`safe-fetch.ts`, 8 s défaut). Une réponse vide n'est
jamais traitée comme une donnée valide.

## PDF & partage

- **PDF** : `GET /api/estimations/[id]/pdf` (ownership) — rendu Chromium (Playwright)
  du composant `Brochure` à partir de l'estimation persistée, caché sur Cloudflare R2.
  MIME `application/pdf`, contenu = valeur/fourchette/prix-m²/comparables/ajustements/
  sources/avertissements/branding. Titre échappé (anti-injection).
- **Partage public** : `POST /api/estimations/[id]/share` (ownership) émet un JWT
  HS256 signé (`REPORT_SHARING_SECRET`, payload `{eid, exp}`, TTL 30 j) — pas d'ID
  brut exposé. Page `/brochure/<token>` (`noindex,nofollow,noarchive`) + PDF public
  `GET /api/brochure/<token>/pdf`. Token invalide/expiré → rejet. **Révocation :
  expiration-only** (pas de liste de révocation par `jti`).

## Entretien IA (aide à la saisie, non bloquant)

`POST /api/estimations/[id]/interview` — LLM (Kimi/Claude via `lib/llm/`). Si le
provider est absent/en erreur, message clair et **saisie manuelle toujours
possible** ; l'estimation reste calculable. Les extractions sont validées champ
par champ (`PropertyDataSchema`) ; l'IA ne peut pas écrire un champ invalide. Les
traces Langfuse sont **scrubées** (adresse/email masqués). Limite connue : la
distinction « donnée confirmée vendeur » vs « donnée inférée IA » repose sur la
discipline du prompt (`field_status.to_confirm`), la colonne `confirmed_blocks`
reste non câblée.

## Liaison CRM → Estimation

Bouton « Estimer ce bien » (page bien) → `/estimations/new?property=<id>` →
estimation préremplie depuis les données du bien (`lib/estimation/from-property.ts`),
`property_id` posé (migration `0039`, FK `properties`), rattachement bidirectionnel
(`properties.estimation_id`). Retour vers le bien depuis la page estimation.

## Sauvegarde DB

Backup avant migration : `ssh gpu1 "docker exec nexus-postgres pg_dump -U postgres -d real-estate-agent -Fc" > backup.dump`
(format custom, en-tête `PGDMP`). Migrations `0038`/`0039` appliquées après backup,
purement additives (colonnes nullable + index), rollback en pied de chaque fichier.
