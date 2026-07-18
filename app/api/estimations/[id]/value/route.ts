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
import { getGpu1Admin } from '@/lib/gpu1';
import { tenantOf } from '@/lib/tenant';
import { loadOwnedEstimation } from '@/lib/estimation/owned';
import { rateLimit } from '@/lib/ratelimit';
import { captureFatal } from '@/lib/server/observe';
import { captureServer } from '@/lib/providers/posthog';
import { geocodeWithProvenance } from '@/lib/estimation/geocode';
import { resolveParcelle } from '@/lib/estimation/cadastre';
import { candidateSections } from '@/lib/estimation/sections';
import { fetchMutationsMultiSection } from '@/lib/estimation/dvf';
import { buildComparables } from '@/lib/estimation/comparables';
import { fetchDpeForAddress } from '@/lib/estimation/ademe';
import { computeValuation } from '@/lib/estimation/valuation';
import { fetchListingComparables } from '@/lib/estimation/listings';
import { buildSourcesSnapshot } from '@/lib/estimation/snapshot';
import { buildProvenance } from '@/lib/estimation/provenance';
import { ENGINE_VERSION } from '@/lib/estimation/valuation';
import type { PropertyData, MarketAnalysis } from '@/lib/estimation/types';
import type { Json } from '@/lib/gpu1/database.types';

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

  // `?force=true` autorise explicitement un recalcul d'une estimation déjà `ready`
  // (sinon simplement loggé). Un `archived` n'est JAMAIS écrasé, même en force.
  const force = new URL(_req.url).searchParams.get('force') === 'true';

  // ── Auth ────────────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ── Supabase ────────────────────────────────────────────────────────────
  const sb = getGpu1Admin();
  if (!sb) {
    return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  }

  const userId = claims.sub;
  const tenant = tenantOf(claims);

  // ── Ownership check ─────────────────────────────────────────────────────
  const estimation = await loadOwnedEstimation(sb, id, userId, tenant);
  if (!estimation) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // ── Garde anti-écrasement ───────────────────────────────────────────────
  // Une estimation `archived` est un livrable figé : on refuse tout recalcul
  // qui écraserait silencieusement la valeur remise au vendeur.
  // Une estimation `ready` PEUT être réévaluée (l'agent peut vouloir relancer
  // après correction du bien) : on l'autorise mais on le trace explicitement,
  // et `valued_at`/`engine_version` sont réécrits à jour à la persistance.
  if (estimation.status === 'archived') {
    return NextResponse.json(
      { error: 'estimation_archived', message: 'Estimation archivée : recalcul refusé.' },
      { status: 409 },
    );
  }
  if (estimation.status === 'ready' && estimation.valuation) {
    console.warn(
      `[value/route] recalcul d'une estimation déjà finalisée id=${id} status=ready force=${force} — la valorisation précédente sera remplacée`,
    );
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
      // Alertes qualité émises pendant le pipeline (mode dégradé, source absente…).
      // Persistées dans `quality_alerts` au lieu d'être jetées après le stream.
      const qualityAlerts: { code: string; message: string }[] = [];

      const emit = (frame: Record<string, unknown>) => {
        if (frame.type === 'error' && typeof frame.message === 'string') {
          qualityAlerts.push({
            code: typeof frame.code === 'string' ? frame.code : 'degraded',
            message: frame.message,
          });
        }
        controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
      };

      try {
        // ── Géocodage ─────────────────────────────────────────────────
        emit({ type: 'progress', step: 'Géocodage…' });

        const adresse = [property.adresse, property.ville, property.code_postal]
          .filter(Boolean)
          .join(', ');

        const geoOutcome = await geocodeWithProvenance(adresse);
        const geo = geoOutcome?.result ?? null;

        if (!geo) {
          emit({
            type: 'error',
            code: 'geocode_failed',
            message: 'Adresse introuvable — données de marché indisponibles.',
          });
          // Persiste un état dégradé et ferme
          const valuedAt = new Date().toISOString();
          const degradedValuation = computeValuation(property, [], {
            medianPricePerSqm: null,
            confidence: 'indicative',
            geocoded: false,
            refNowIso: valuedAt,
          });
          const saleStrategies = buildSaleStrategies(0);
          // Provenance honnête : géocodage échoué → tout indisponible en aval.
          // Le DPE reste tracé s'il a été fourni par le vendeur au dossier.
          const degradedProvenance = buildProvenance({
            geocode: null,
            cadastreResolved: false,
            dvfComparables: 0,
            dpe: property.dpe_classe ? { via: 'provided' } : null,
            listings: { source: 'none', count: 0, fallbackUsed: false },
          });
          const degradedSnapshot = buildSourcesSnapshot(
            { adresse, geo: null, provenance: degradedProvenance },
            valuedAt,
          );
          await sb.from('estimations').update({
            valuation: degradedValuation as unknown as Json,
            sale_strategies: saleStrategies as unknown as Json,
            sources_snapshot: degradedSnapshot as unknown as Json,
            engine_version: ENGINE_VERSION,
            valued_at: valuedAt,
            data_status: degradedValuation.dataStatus,
            quality_alerts: qualityAlerts as unknown as Json,
            status: 'ready',
            updated_at: valuedAt,
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

        const { comparables, medianPricePerSqm, nbComparables, confidence, distanceMoyenneKm } =
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

        // Instant de valorisation — unique pour toute la passe (récence des comps,
        // fetched_at du market, valued_at persisté). Couche IO : jamais dans la fn pure.
        const valuedAt = new Date().toISOString();

        // Mode dégradé si <3 comps
        if (nbComparables < 3) {
          emit({
            type: 'error',
            code: 'few_comparables',
            message: `Seulement ${nbComparables} transaction(s) comparable(s) trouvée(s). La valorisation est indicative.`,
          });
        }

        // ── DPE ADEME (best-effort) ───────────────────────────────────
        emit({ type: 'progress', step: 'DPE…' });

        // `dpeVia` trace la SOURCE réelle de la classe DPE pour la provenance :
        //   provided = fournie par le vendeur · ademe = résolue via ADEME · null = inconnue.
        let resolvedDpeClasse = property.dpe_classe;
        let dpeVia: 'provided' | 'ademe' | null = property.dpe_classe ? 'provided' : null;
        if (!resolvedDpeClasse && adresse) {
          const ademeResult = await fetchDpeForAddress(adresse);
          if (ademeResult.classe) {
            resolvedDpeClasse = ademeResult.classe as PropertyData['dpe_classe'];
            dpeVia = 'ademe';
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
          geocoded: true,
          distanceMoyenneKm,
          refNowIso: valuedAt,
        });

        const saleStrategies = buildSaleStrategies(valuation.marketValue);

        // ── Annonces en cours (MySwarms, best-effort → [] si non configuré) ──
        emit({ type: 'progress', step: 'Annonces…' });
        const listingResult = await fetchListingComparables({
          ville: property.ville,
          codePostal: property.code_postal,
          typeBien: property.type_bien,
          surface: property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null,
          nbPieces: property.nombre_pieces,
        });
        const listingComparables = listingResult.listings;

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
          listing_source: listingResult,
          subject_lat: geo.lat,
          subject_lon: geo.lon,
          fetched_at: valuedAt,
        };

        // ── Provenance honnête par source (LIVE/FALLBACK/UNAVAILABLE) ────
        // Dérivée de ce qui s'est RÉELLEMENT passé : géocodeur utilisé, parcelle
        // résolue, nb de comparables DVF retenus, source réelle du DPE, source
        // réelle des annonces. Aucune source « toujours présente » inventée.
        const provenance = buildProvenance({
          geocode: { via: geoOutcome!.via },
          cadastreResolved: parcelle !== null,
          dvfComparables: nbComparables,
          dpe: dpeVia === null ? null : { via: dpeVia },
          listings: {
            source: listingResult.source,
            count: listingResult.filteredCount,
            fallbackUsed: listingResult.fallbackUsed,
          },
        });

        // ── Snapshot sources (auditabilité, capé, inclus dans l'update) ──
        const sourcesSnapshot = buildSourcesSnapshot(
          {
            adresse,
            geo,
            parcelle,
            sections,
            mutations,
            dpeClasse: resolvedDpeClasse ?? null,
            listings: listingComparables,
            provenance,
          },
          market.fetched_at,
        );

        // ── Persist ───────────────────────────────────────────────────
        await sb
          .from('estimations')
          .update({
            market: market as unknown as Json,
            valuation: valuation as unknown as Json,
            sale_strategies: saleStrategies as unknown as Json,
            sources_snapshot: sourcesSnapshot as unknown as Json,
            market_value: valuation.marketValue || null,
            recommended_price: valuation.recommendedListingPrice || null,
            surface: property.surface_habitable_m2 ?? property.surface_carrez_m2 ?? null,
            engine_version: ENGINE_VERSION,
            valued_at: valuedAt,
            data_status: valuation.dataStatus,
            quality_alerts: qualityAlerts as unknown as Json,
            status: 'ready',
            updated_at: valuedAt,
          })
          .eq('id', id);

        captureServer(userId, 'estimation_generated', {
          estimation_id: id,
          type_bien: property.type_bien ?? null,
          code_postal: property.code_postal ?? null,
          nb_comparables: nbComparables,
          confidence,
          market_value: valuation.marketValue ?? null,
        });

        emit({ type: 'done', valuation, market });
      } catch (err) {
        console.error('[value/route] pipeline error:', err);
        // Le 200 (stream) est déjà parti : pas de 500 HTTP, mais l'exception
        // pipeline reste fatale → on la capture quand même.
        captureFatal(err, 'estimations/[id]/value');
        try {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: 'error', message: 'pipeline_error' }) + '\n',
            ),
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
