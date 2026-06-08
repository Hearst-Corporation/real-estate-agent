-- 0032 — Repointe la FK des matchs vers la table de critères CANONIQUE.
--
-- Contexte : `prosp_matchs.critere_id` pointait vers `prosp_criteres` (table morte,
-- 0 ligne), alors que les critères acquéreur de la prospection agent vivent dans
-- `prosp_criteres_acquereur` (table canonique, alimentée par BienCible + le chat).
-- Conséquence : tout upsert de match échouait avec 23503 (FK violation) → aucun
-- match n'a jamais pu être persisté (ni par le cron prospScoring, ni par
-- l'endpoint scrape-custom).
--
-- Fix : DROP + ADD de la SEULE FK `prosp_matchs.critere_id`, repointée vers
-- `prosp_criteres_acquereur(id)`, en conservant ON DELETE CASCADE (cohérent avec
-- l'ancienne contrainte et l'usage : supprimer un critère purge ses matchs).
--
-- Périmètre strict : on ne touche NI les autres FK vers prosp_criteres
-- (prosp_match_feedback, prosp_envois), NI la table prosp_criteres elle-même.
-- prosp_matchs est vide → migration sans perte de données.

ALTER TABLE public.prosp_matchs
  DROP CONSTRAINT IF EXISTS prosp_matchs_critere_id_fkey;

ALTER TABLE public.prosp_matchs
  ADD CONSTRAINT prosp_matchs_critere_id_fkey
  FOREIGN KEY (critere_id)
  REFERENCES public.prosp_criteres_acquereur(id)
  ON DELETE CASCADE;
