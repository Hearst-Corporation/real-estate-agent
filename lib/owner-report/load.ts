/**
 * lib/owner-report/load.ts — Chargement GPU1 du tableau propriétaire (server-only).
 *
 * Owner-check STRICT : le client service-role bypass RLS → chaque requête filtre
 * explicitement `user_id` + `tenant_id`. Le bien est d'abord vérifié possédé,
 * puis l'activité (visites, diffusions, tâches) est lue scopée au même
 * user+tenant + property_id. Aucune donnée d'un autre tenant ne peut fuiter.
 *
 * Dégrade proprement : une table absente / une erreur de lecture donne un bloc
 * vide (état honnête côté UI), jamais un crash.
 */

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import {
  buildOwnerReport,
  type OwnerReport,
  type VisitRow,
  type BroadcastRow,
  type TaskRow,
} from "@/lib/owner-report/aggregate";

/** Nb max de lignes lues par bloc (aucune liste sans LIMIT). */
const LIST_LIMIT = 200;

export interface OwnerReportProperty {
  id: string;
  title: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  status: string;
  asking_price: number | null;
}

export interface OwnerReportMandate {
  id: string;
  reference: string | null;
  kind: string;
  status: string;
  signed_at: string | null;
  expires_at: string | null;
}

export interface OwnerReportBundle {
  property: OwnerReportProperty;
  mandate: OwnerReportMandate | null;
  report: OwnerReport;
}

/**
 * Charge le bundle complet pour un bien possédé par (userId, tenant).
 * Retourne `null` si le bien n'existe pas / n'appartient pas à l'utilisateur.
 */
export async function loadOwnerReport(
  db: Gpu1Client,
  propertyId: string,
  userId: string,
  tenant: string,
): Promise<OwnerReportBundle | null> {
  // ── 1. Bien possédé (owner-check dur) ────────────────────────────────────
  const { data: property } = await db
    .from("properties")
    .select(
      "id, title, address, city, postal_code, status, asking_price, user_id, tenant_id",
    )
    .eq("id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .maybeSingle();

  if (!property) return null;

  // ── 2. Mandat lié (le "propriétaire" = mandant du mandat sur ce bien) ─────
  const { data: mandate } = await db
    .from("mandates")
    .select("id, reference, kind, status, signed_at, expires_at")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .order("signed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // ── 3. Activité réelle, scopée user+tenant+property ───────────────────────
  const [visits, broadcasts, tasks] = await Promise.all([
    loadVisits(db, propertyId, userId, tenant),
    loadBroadcasts(db, propertyId, tenant),
    loadTasks(db, propertyId, userId, tenant),
  ]);

  const report = buildOwnerReport({ visits, broadcasts, tasks });

  return {
    property: {
      id: property.id,
      title: property.title,
      address: property.address,
      city: property.city,
      postal_code: property.postal_code,
      status: property.status,
      asking_price: property.asking_price,
    },
    mandate: mandate
      ? {
          id: mandate.id,
          reference: mandate.reference,
          kind: mandate.kind,
          status: mandate.status,
          signed_at: mandate.signed_at,
          expires_at: mandate.expires_at,
        }
      : null,
    report,
  };
}

async function loadVisits(
  db: Gpu1Client,
  propertyId: string,
  userId: string,
  tenant: string,
): Promise<VisitRow[]> {
  const { data, error } = await db
    .from("visits")
    .select("id, status, scheduled_at, feedback, notes, created_at")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .order("scheduled_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error || !data) return [];
  return data as VisitRow[];
}

/**
 * Diffusions RÉELLES = annonces du bien (prosp_annonces filtré sur property_id).
 * Une ligne = le bien publié sur une source de diffusion. `prosp_annonces` porte
 * `tenant_id` + `property_id` mais PAS de `user_id` : l'appartenance est déjà
 * établie par l'owner-check sur `properties` (property_id vérifié possédé), on
 * scope donc tenant + property_id. Dégrade en `[]` si la table est absente.
 */
async function loadBroadcasts(
  db: Gpu1Client,
  propertyId: string,
  tenant: string,
): Promise<BroadcastRow[]> {
  const { data, error } = await db
    .from("prosp_annonces")
    .select("id, source, actif, date_publication, created_at")
    .eq("property_id", propertyId)
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error || !data) return [];
  return data as BroadcastRow[];
}

async function loadTasks(
  db: Gpu1Client,
  propertyId: string,
  userId: string,
  tenant: string,
): Promise<TaskRow[]> {
  const { data, error } = await db
    .from("rea_tasks")
    .select("id, title, kind, status, priority, due_at, notes, created_at, entity_type, entity_id")
    .eq("entity_type", "property")
    .eq("entity_id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenant)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(LIST_LIMIT);
  if (error || !data) return [];
  return data as TaskRow[];
}
