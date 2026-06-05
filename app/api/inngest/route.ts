/**
 * /api/inngest — endpoint serve() Inngest (GET introspection, PUT register, POST invoke).
 *
 * Sécurité : route ouverte au proxy (pas d'auth JWT) car l'authentification se
 * fait par signature HMAC Inngest (INNGEST_SIGNING_KEY). Un POST non signé est
 * rejeté par serve() quand la clé est présente.
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/inngest/client";
import { functions } from "@/lib/jobs/inngest/functions";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
