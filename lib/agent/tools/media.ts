/**
 * lib/agent/tools/media.ts — Outils agentiques de génération d'image (fal.ai + R2).
 *
 * Expose un AgentTool : generate_property_image.
 * Consomme lib/providers/fal.ts (generateImage) et lib/storage/r2.ts (putObject/publicUrl).
 * Garde de coût via lib/providers/cost-guard.ts (pattern identique à market-context).
 *
 * ⚠️  Les images produites sont des ILLUSTRATIONS / home-staging IA.
 *     Ce ne sont JAMAIS des photos réelles du bien.
 */

import { randomUUID } from "node:crypto";
import type { AgentTool, ToolResult } from "@/lib/agent/types";
import { falIsConfigured, generateImage } from "@/lib/providers/fal";
import { r2IsConfigured, putObject, publicUrl } from "@/lib/storage/r2";
import { paidCall } from "@/lib/providers/cost-guard";

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Plafond d'appels fal.ai payants par jour. */
const FAL_DAILY_CAP = 50;

/** TTL du cache résultat (1 h — les images partagent le même prompt fal, pas besoin de 48 h). */
const FAL_CACHE_TTL_SEC = 3_600;

/** Taille d'image par défaut si le LLM ne précise pas. */
const DEFAULT_IMAGE_SIZE = "landscape_4_3";

// ─── Messages de dégradation ─────────────────────────────────────────────────

const MSG_FAL_ABSENT: ToolResult = {
  ok: false,
  summary: "Génération d'image non disponible",
  observation:
    "La génération d'image est non disponible : la variable FAL_KEY est absente de la configuration. " +
    "Aucune image ne peut être produite pour l'instant.",
};

const MSG_QUOTA_ATTEINT: ToolResult = {
  ok: false,
  summary: "Quota génération atteint",
  observation:
    "Le quota journalier de génération d'images est atteint (50 images/jour). " +
    "Réessaie demain ou contacte l'administrateur pour augmenter la limite.",
};

const MSG_COST_GUARD_INDISPONIBLE: ToolResult = {
  ok: false,
  summary: "Garde de coût indisponible",
  observation:
    "Le garde de coût (Redis) est indisponible : l'appel payant de génération d'image a été refusé par sécurité. " +
    "Vérifie la connexion Redis (UPSTASH_REDIS_REST_URL / TOKEN) et réessaie.",
};

// ─── Outil generate_property_image ───────────────────────────────────────────

const generatePropertyImageTool: AgentTool = {
  name: "generate_property_image",
  description:
    "Génère une IMAGE D'ILLUSTRATION (home-staging IA, rendu architectural, ambiance) pour un bien immobilier. " +
    "⚠️  L'image produite est une ILLUSTRATION générée par IA — ce n'est JAMAIS une photo réelle du bien. " +
    "Elle peut servir à enrichir une brochure, un avis de valeur ou un support marketing, " +
    "à condition que ce statut d'illustration soit clairement affiché auprès du client. " +
    "Paramètres : prompt (description précise), image_size (optionnel, ex. 'landscape_4_3').",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Description précise de l'image à générer (style, pièce, ambiance, lumière, type de bien). " +
          "Ex. : 'Salon lumineux de 30 m² dans un appartement haussmannien rénové, parquet chêne, moulures, grandes fenêtres, lumière naturelle, photo d'intérieur professionnelle'.",
      },
      image_size: {
        type: "string",
        description:
          "Format de l'image. Valeurs acceptées : 'landscape_4_3' (défaut), 'landscape_16_9', 'portrait_4_3', 'square'. " +
          "Laisse vide pour utiliser le format par défaut (paysage 4/3).",
      },
    },
    required: ["prompt"],
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  execute: async (args, _ctx): Promise<ToolResult> => {
    // ── 1. Validation défensive des paramètres LLM ────────────────────────────
    const prompt =
      typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      return {
        ok: false,
        summary: "Paramètre manquant",
        observation:
          "Le champ 'prompt' est requis pour générer une image. " +
          "Décris l'image souhaitée (type de bien, pièce, ambiance, style).",
      };
    }

    const imageSize =
      typeof args.image_size === "string" && args.image_size.trim()
        ? args.image_size.trim()
        : DEFAULT_IMAGE_SIZE;

    // ── 2. Vérification que fal.ai est configuré ─────────────────────────────
    if (!falIsConfigured()) {
      return MSG_FAL_ABSENT;
    }

    // ── 3. Cost-guard (pattern identique à market-context/route.ts) ───────────
    //    Provider : "fal", clé de cache : hash court du prompt+size.
    //    fail-closed : si Redis absent → REFUSE (pas d'appel payant à l'aveugle).
    const cacheKey = `${imageSize}:${prompt.slice(0, 200)}`;

    const result = await paidCall<{ imageUrl: string; storedUrl: string }>(
      "fal",
      cacheKey,
      async () => {
        // ── 3a. Appel fal.ai ─────────────────────────────────────────────────
        const generated = await generateImage(prompt, { imageSize });
        const falUrl = generated.imageUrl;

        // ── 3b. Persistance R2 (si configuré), fallback URL fal directe ──────
        if (r2IsConfigured() && falUrl) {
          try {
            const resp = await fetch(falUrl);
            if (resp.ok) {
              const buffer = Buffer.from(await resp.arrayBuffer());
              const key = `media/generated/${randomUUID()}.png`;
              await putObject(key, buffer, "image/png");
              const storedUrl = publicUrl(key);
              return { imageUrl: falUrl, storedUrl };
            }
          } catch {
            // Si le téléchargement ou le putObject échoue, on retombe sur l'URL fal
          }
        }

        // Fallback : URL fal directe (pas de R2 ou download échoué)
        return { imageUrl: falUrl, storedUrl: falUrl };
      },
      { ttlSec: FAL_CACHE_TTL_SEC, dailyCap: FAL_DAILY_CAP },
    );

    // ── 4. Interprétation du résultat du cost-guard ───────────────────────────
    if (!result.ok) {
      if (result.reason === "daily_cap_reached") return MSG_QUOTA_ATTEINT;
      return MSG_COST_GUARD_INDISPONIBLE;
    }

    const { storedUrl } = result.data;
    const isR2 = storedUrl !== result.data.imageUrl;
    const stockageNote = isR2
      ? "L'image a été persistée sur le stockage R2 (URL durable)."
      : "R2 non configuré : URL fal.ai directe (durée de vie limitée).";

    return {
      ok: true,
      summary: "Illustration générée",
      observation:
        `Image générée avec succès.\n\n` +
        `URL : ${storedUrl}\n\n` +
        `${stockageNote}\n\n` +
        `⚠️  IMPORTANT : cette image est une ILLUSTRATION générée par IA (home-staging / rendu architectural). ` +
        `Ce n'est PAS une photo réelle du bien. Elle doit être présentée explicitement comme telle ` +
        `dans tout support marketing ou avis de valeur transmis au client.`,
    };
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const mediaTools: AgentTool[] = [generatePropertyImageTool];
