create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare claims jsonb; tid text;
begin
  tid := coalesce(nullif(event -> 'claims' -> 'app_metadata' ->> 'tenant_id', ''), 'real-estate-agent');
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{app_metadata,tenant_id}', to_jsonb(tid));
  return jsonb_set(event, '{claims}', claims);
end; $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
