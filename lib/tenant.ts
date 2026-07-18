export const DEFAULT_TENANT = process.env.TENANT_ID || "real-estate-agent";

export function tenantOf(claims: { tenant_id?: string } | null | undefined): string {
  return claims?.tenant_id || DEFAULT_TENANT;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retourne un owner_id UUID valide pour les appels vers l'engine MySwarms.
 * Priorité : tenant_id (si UUID) → sub (user_id, toujours un UUID).
 */
export function uuidOwnerOf(claims: { tenant_id?: string; sub?: string } | null | undefined): string {
  if (claims?.tenant_id && UUID_RE.test(claims.tenant_id)) return claims.tenant_id;
  if (claims?.sub && UUID_RE.test(claims.sub)) return claims.sub;
  return "00000000-0000-0000-0000-000000000000";
}
