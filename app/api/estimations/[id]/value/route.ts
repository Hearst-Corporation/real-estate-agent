/**
 * POST /api/estimations/[id]/value
 *
 * Pipeline de valorisation — stream NDJSON de progression.
 *
 * Frames émises :
 *   { type: "progress", step: string }         — étape en cours
 *   { type: "error",   message: string }        — erreur non-fatale (mode dégradé)
 *   { type: "done",    valuation, market }       — résultat final
 *
 * Mode dégradé : si <3 comps, confidence='indicative' + message, mais on persiste.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server/session';
import { getSupabaseAdmin } from '@/lib/server/supabase';
import { tenantOf } from '@/lib/tenant';
import { loadOwnedEstimation } from '@/lib/estimation/owned';
import { rateLimit } from '@/lib/ratelimit';
import { geocode } from '@/lib/estimation/geocode';
import { resolveParcelle } from '@/lib/estimation/cadastre';
import { candidateSections } from '@/lib/estimation/sections';
import { fetchMutationsMultiSection } from '@/lib/estimation/dvf';
import { buildComparables } from '@/lib/estimation/comparables';
import { fetchDpeForAddress } from '@/lib/estimation/ademe';
import { computeValuation } from '@/lib/estimation/valuation';
import { fetchListingComparables } from '@/lib/estimation/listings';
import type { PropertyData, MarketAnalysis } from '@/lib/estimation/types';
import type { Json } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Sale strategies ──────────────────────────────────────────────────────────

function buildSaleStrategies(marketValue: number): string[] {
  const rapide = Math.round(marketValue * 0.97);
  const valorisation = Math.round(marketValue * 1.05);
  return [
    `Vente rapide — Prix affiché : ${rapide.toLocaleString('fr-FR')} €. Délai cible < 60 jours. Attire les acheteurs finançables rapidement.`,
    `Valorisation — Prix affiché : ${valorisation.toLocaleString('fr-FR')} €. Délai estimé 90–120 jours. Maximise le produit net vendeur.`,
  ];
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // ── Auth ────────────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ── Supabase ────────────────────────────────────────────────────────────
  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 503 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // ── Ownership check ─────────────────────────────────────────────────────
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // ── Rate-limit (5 req / 60 s per user) ─────────────────────────────────
  const allowed = await rateLimit(`value:${userId}`, 5, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const property = (estimation.property ?? {}) as PropertyData;

  // ── NDJSON stream ───────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (frame: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
      };

      try {
        // ── Géocodage ─────────────────────────────────────────────────
        emit({ type: 'progress', step: 'Géocodage…' });

        const adresse = [property.adresse, property.ville, property.code_postal]
          .filter(Boolean)
          .join(', ');

        const geo = await geocode(adresse);

        if (!geo) {
          emit({ type: 'error', message: 'Adresse introuvable — données de marché indisponibles.' });
          // Persiste un état dégradé et ferme
          const degradedValuation = computeValuation(property, [], {
            medianPricePerSqm: null,
            confidence: 'indicative',
          });
          const saleStrategies = buildSaleStrategies(0);
          await sb.from('estimations').update({
            valuation: degradedValuation as unknown as Json,
            sale_strategies: saleStrategies as unknown as Json,
            status: 'ready',
            updated_at: new Date().toISOString(),
          }).eq('id', id);

          emit({ type: 'done', valuation: degradedValuation, market: null });
          controller.close();
          return;
        }

        // ── Cadastre ──────────────────────────────────────────────────
        emit({ type: 'progress', step: 'Cadastre…' });

        const parcelle = await resolveParcelle(geo.lat, geo.lon);
        // INSEE DVF = code BAN (arrondissement pour Lyon/Paris/Marseille ; le code
        // cadastre serait la commune 69123 → DVF 0). Sections via bbox autour du point.
        const inseeCode = geo.inseeCode;

        // ── DVF ───────────────────────────────────────────────────────
        emit({ type: 'progress', step: 'DVF…' });

        const sections = await candidateSections(geo.lat, geo.lon, parcelle?.section);
        const mutations = await fetchMutationsMultiSection(inseeCode, sections);

        const { comparables, medianPricePerSqm, nbComparables, confidence } =
          buildComparables(
            {
              type_bien: property.type_bien,
              nombre_pieces: property.nombre_pieces,
              surface: property.surface_habitable_m2 ?? property.surface_carrez_m2,
              lat: geo.lat,
              lon: geo.lon,
            },
            mutations,
          );

        // Mode dégradé si <3 comps
        if (nbComparables < 3) {
          emit({
            type: 'error',
            message: `Seulement ${nbComparables} transaction(s) comparable(s) trouvée(s). La valorisation est indicative.`,
          });
        }

        // ── DPE ADEME (best-effort) ───────────────────────────────────
        emit({ type: 'progress', step: 'DPE…' });

        let resolvedDpeClasse = property.dpe_classe;
        if (!resolvedDpeClasse && adresse) {
          const ademeResult = await fetchDpeForAddress(adresse);
          if (ademeResult.classe) {
            resolvedDpeClasse = ademeResult.classe as PropertyData['dpe_classe'];
          }
        }

        // Inject DPE corrigé dans la property pour la valorisation
        const propertyForValuation: PropertyData = resolvedDpeClasse
          ? { ...property, dpe_classe: resolvedDpeClasse }
          : property;

        // ── Calcul ────────────────────────────────────────────────────
        emit({ type: 'progress', step: 'Calcul…' });

        const valuation = computeValuation(propertyForValuation, comparables, {
          medianPricePerSqm,
          confidence,
          compDpeMix: null, // pas de DPE moyen connu sur les comps DVF
        });

        const saleStrategies = buildSaleStrategies(valuation.marketValue);

        // ── Annonces en cours (MySwarms, best-effort → [] si non configuré) ──
        emit({ type: 'progress', step: 'Annonces…' });
        const listingComparables = await fetchListingComparables({
          ville: property.ville,
          codePostal: property.code_postal,
          typeBien: property.type_bien,
          surface: property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null,
          nbPieces: property.nombre_pieces,
        });

        // ── MarketAnalysis ────────────────────────────────────────────
        const market: MarketAnalysis = {
          zone: `${geo.city} (${inseeCode})`,
          prix_median_m2: medianPricePerSqm ?? 0,
          prix_moyen_m2: medianPricePerSqm ?? 0, // proxy (pas de moyenne calculée ici)
          nb_transactions_12m: nbComparables,
          tendance: 'stable',
          delai_moyen_vente_jours: null,
          dvf_comparables: comparables,
          listing_comparables: listingComparables,
          fetched_at: new Date().toISOString(),
        };

        // ── Persist ───────────────────────────────────────────────────
        await sb
          .from('estimations')
          .update({
            market: market as unknown as Json,
            valuation: valuation as unknown as Json,
            sale_strategies: saleStrategies as unknown as Json,
            market_value: valuation.marketValue || null,
            recommended_price: valuation.recommendedListingPrice || null,
            surface: property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null,
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        emit({ type: 'done', valuation, market });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'pipeline_error';
        console.error('[value/route] pipeline error:', err);
        try {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'error', message: msg }) + '\n'),
          );
        } catch {
          // controller might already be closed
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Estimation-Id': id,
    },
  });
}
