-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 — INVEST : durcissement sécurité de la piste d'audit
-- ═══════════════════════════════════════════════════════════════════════════
-- public.inv_append_audit_log (0020) est la SEULE voie d'écriture de inv_audit_log
-- et est SECURITY DEFINER (elle écrit malgré la policy restrictive + chaîne le hash).
-- Par défaut, PostgREST expose toute fonction au rôle PUBLIC → elle était appelable
-- en RPC par `anon` et `authenticated` (advisors 0028/0029). Un client pourrait
-- alors FORGER des entrées d'audit. On retire ce droit : seul le service-role
-- (back-office serveur) peut l'appeler. Les triggers internes ne sont pas affectés.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.inv_append_audit_log(
  text, text, uuid, text, text, uuid, jsonb, jsonb, jsonb, inet, text, text
) from public, anon, authenticated;

grant execute on function public.inv_append_audit_log(
  text, text, uuid, text, text, uuid, jsonb, jsonb, jsonb, inet, text, text
) to service_role;
