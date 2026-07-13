-- 0033 — Repointe les 2 FK résiduelles vers la table de critères CANONIQUE.
--
-- Suite de 0032 : `prosp_match_feedback.critere_id` et `prosp_envois.critere_id`
-- pointaient encore vers `prosp_criteres` (table morte, 0 ligne) alors que les
-- critères acquéreur vivent dans `prosp_criteres_acquereur`. Sans ce fix, les
-- actions visibles sur les matchs (feedback 👍👎, contacter/envoi) auraient
-- échoué avec une FK violation dès leur première utilisation.
--
-- IMPORTANT — on PRÉSERVE le comportement ON DELETE de chaque FK d'origine :
--   - prosp_match_feedback : ON DELETE SET NULL (critere_id nullable → un feedback
--     survit à la suppression de son critère, choix d'origine conservé).
--   - prosp_envois         : ON DELETE CASCADE (critere_id NOT NULL → purge avec
--     le critère, choix d'origine conservé).
--
-- Périmètre strict : on ne touche QUE ces 2 FK. prosp_criteres NON supprimée.
-- Les 2 tables sont vides → migration sans perte de données.
--
-- IDEMPOTENCE (2026-07-13) : selon l'état schéma cumulé, `critere_id` peut être
-- absente de prosp_match_feedback et la table prosp_envois inexistante. On garde
-- l'intention (repointer la FK vers prosp_criteres_acquereur QUAND la colonne
-- existe) mais chaque bloc devient conditionnel → migration re-jouable à froid
-- sur une base neuve (montage gpu1) comme sur l'historique Cloud.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prosp_match_feedback' AND column_name='critere_id'
  ) THEN
    ALTER TABLE public.prosp_match_feedback
      DROP CONSTRAINT IF EXISTS prosp_match_feedback_critere_id_fkey;
    ALTER TABLE public.prosp_match_feedback
      ADD CONSTRAINT prosp_match_feedback_critere_id_fkey
      FOREIGN KEY (critere_id)
      REFERENCES public.prosp_criteres_acquereur(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prosp_envois' AND column_name='critere_id'
  ) THEN
    ALTER TABLE public.prosp_envois
      DROP CONSTRAINT IF EXISTS prosp_envois_critere_id_fkey;
    ALTER TABLE public.prosp_envois
      ADD CONSTRAINT prosp_envois_critere_id_fkey
      FOREIGN KEY (critere_id)
      REFERENCES public.prosp_criteres_acquereur(id)
      ON DELETE CASCADE;
  END IF;
END $$;
