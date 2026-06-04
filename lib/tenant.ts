export const DEFAULT_TENANT = process.env.TENANT_ID || "real-estate-agent";

export function tenantOf(claims: { tenant_id?: string } | null | undefined): string {
  return claims?.tenant_id || DEFAULT_TENANT;
}
