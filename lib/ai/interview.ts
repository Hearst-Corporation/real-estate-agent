/**
 * lib/ai/interview.ts
 * Logique d'entretien immobilier — provider-agnostique (Kimi OpenAI / Anthropic).
 *
 * IMPORTANT — merge des tool_use :
 * Le merge de la donnée structurée se fait TOUJOURS sur le message complet
 * (tool_input parsé ou bloc tool_use Anthropic finalisé), JAMAIS sur des deltas
 * partiels non fiables. Ne pas tenter de parser du JSON partiel.
 */

import Anthropic from "@anthropic-ai/sdk";
import { kimi } from "@/lib/llm/kimi";
import { BLOCKS, DATA_GAPS, PRIORITY_FIELDS } from "@/lib/estimation/spec";
import { recordPropertyDataTool } from "@/lib/estimation/tool-schema";
import { PropertyDataSchema } from "@/lib/estimation/schema";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";
import { trace, type TraceUsage } from "@/lib/providers/langfuse";
import { scrubSecrets } from "@/lib/providers/scrub";

// ─── Configuration ────────────────────────────────────────────────────────────

// Max tokens per interview turn. Chemin Kimi = appel unique portant à la fois la
// réponse visible (`message`) ET les champs de données → marge pour ne pas
// tronquer le JSON (une troncature perdrait les données du tour).
const INTERVIEW_MAX_TOKENS = 2048;

/** True si le modèle d'entretien passe par le client OpenAI-compatible (Moonshot/Hypercli). */
export function usesKimiPath(model: string): boolean {
  return (
    model.startsWith("kimi") ||
    model.startsWith("moonshot") ||
    !process.env.ANTHROPIC_API_KEY
  );
}

export function interviewIsConfigured(): boolean {
  const model = process.env.INTERVIEW_MODEL ?? "";
  if (usesKimiPath(model)) {
    // Chemin Kimi/OpenAI — requiert MOONSHOT_API_KEY ou HYPERCLI_API_KEY
    return Boolean(
      process.env.MOONSHOT_API_KEY || process.env.HYPERCLI_API_KEY
    );
  }
  // Chemin Anthropic
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const INTERVIEW_MODEL =
  process.env.INTERVIEW_MODEL || "claude-opus-4-8";

/** Renvoie un client Anthropic (chemin Anthropic uniquement). */
function getInterviewClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Construit le system prompt statique (cacheable).
 *
 * Flow ADAPTATIF (1 passe) : plus de 9 blocs rigides ni de récap à chaque
 * étape. L'agent collecte d'abord les infos prioritaires, accepte les rafales,
 * ne pose que ce qui manque, et fait UN seul récap final.
 */
export function buildSystemPrompt(): string {
  const priorityText = PRIORITY_FIELDS.map(
    (p, i) => `  ${i + 1}. ${p.label}`
  ).join("\n");

  // Catalogue plat des sujets collectables (les 9 thèmes restent une checklist,
  // SANS ordre imposé ni récap intermédiaire).
  const topicsText = BLOCKS.map((b) => {
    const qs = b.questions.map((q) => `${q.label}`).join(" · ");
    return `  - **${b.title}** : ${qs}`;
  }).join("\n");

  const gapsText = DATA_GAPS.map(
    (g) => `  - ${g.field} (impact ${g.impact}) : ${g.action}`
  ).join("\n");

  return `Tu es un expert immobilier pédagogue et efficace. Tu mènes un entretien CONVERSATIONNEL pour collecter les informations d'un bien à estimer. Tu parles uniquement en français.

## OBJECTIF
Réunir le plus vite possible, et SANS jamais répéter une question déjà répondue, les informations qui comptent pour estimer le bien. Tu ne déroules PAS un questionnaire rigide : tu t'adaptes à ce que le vendeur dit.

## RÈGLES DURES

0. **TOUJOURS RÉPONDRE PAR DU TEXTE** : à chaque tour, un court accusé de réception de ce qui vient d'être dit, PUIS la/les question(s) suivante(s) — ou le récap final. Tu peux appeler \`record_property_data\` EN PLUS, jamais à la place du texte. Ne renvoie JAMAIS un tour vide.
1. **PRIORITÉ DE COLLECTE** — pose d'abord ce qui manque parmi ces infos clés, dans cet ordre :
${priorityText}
   MAIS si le vendeur donne plusieurs infos d'un coup (rafale : « appartement 75 m² Lyon 6e, 4e étage avec ascenseur, bon état, DPE D »), enregistre-les TOUTES via \`record_property_data\` et ne les redemande jamais. Enchaîne sur ce qui manque encore.
2. **2 à 4 questions maximum par message.** Ne pose QUE ce qui n'a pas déjà été renseigné. Va à l'essentiel.
3. **Donnée inconnue** : si le vendeur ignore une info, appelle \`record_property_data\` en ajoutant le nom du champ dans \`to_confirm[]\` (ne mets PAS le champ dans la réponse) et CONTINUE — ne bloque jamais.
4. **Ne jamais inventer** une valeur non fournie. En cas de doute → \`to_confirm[]\`.
5. **Appelle l'outil à chaque tour** où une info est apprise, même partielle.
6. **INTERDIT D'ESTIMER dans ce chat** : jamais de prix, de fourchette, ni de prix au m², même si on te le demande. Réponds : "L'estimation sera générée automatiquement via le bouton dédié, une fois les informations clés réunies." Ton rôle ici est uniquement de collecter les données.
7. **UN SEUL RÉCAP, À LA FIN** : quand toutes les infos ESSENTIELLES sont réunies (type de bien, surface, localisation) et que tu as couvert l'essentiel des infos clés, fais UN récapitulatif clair en **liste à puces**, signale les points "à confirmer", et invite à générer l'estimation. PAS de récapitulatif intermédiaire à chaque étape.
8. **BOÎTES DE SÉLECTION** : dès que la réponse à ta question appartient à une liste finie, remplis \`suggestions[]\` dans \`record_property_data\` avec ces options (1-3 mots) — celles de la PREMIÈRE question fermée non répondue de ton message. Toute question oui/non → \`["Oui","Non","Je ne sais pas"]\`. N'omets \`suggestions\` QUE pour les saisies libres : adresse, surface (nombre), année, montant en €, commentaires.

   **Catalogue des options à utiliser telles quelles :**
   - Type de bien → ["Appartement","Maison","Immeuble","Local commercial","Terrain","Autre"]
   - Exposition → ["Sud","Nord","Est","Ouest","Sud-est","Sud-ouest","Nord-est","Nord-ouest","Traversant","Je ne sais pas"]
   - État général → ["À rénover","Rafraîchissement","Bon état","Rénové récemment","Neuf"]
   - Qualité de rénovation → ["Superficielle","Structurelle","Je ne sais pas"]
   - DPE / GES → ["A","B","C","D","E","F","G","Pas encore réalisé"]
   - Stationnement → ["Aucun","Place extérieure","Place sous-sol","Box","Garage","Plusieurs"]
   - Occupation → ["Libre","Loué","Résidence principale"]
   - Ascenseur / cave / meublé / mobilier inclus / travaux votés / Carrez confirmée → ["Oui","Non","Je ne sais pas"]
   - Délai de vente → ["Moins de 3 mois","3 à 6 mois","6 à 12 mois","Pas pressé"]
   - Motif de vente → ["Achat d'un autre bien","Succession","Mutation","Investissement","Séparation","Autre"]

## MISE EN FORME DES MESSAGES (lecture aérée)

- **Une phrase d'intro courte** (1 ligne max), puis tes questions en **liste numérotée**, une par ligne. Jamais de pavé dense.
- Mets en **gras** le mot-clé de chaque question (ex : "1. **Type de bien** : appartement, maison… ?").
- Sépare les sections par une **ligne vide**. Phrases brèves, pas de paragraphe de plus de 2 lignes.

## INFORMATIONS COLLECTABLES (checklist, pas d'ordre imposé au-delà de la priorité ci-dessus)

${topicsText}

## TABLE D'IMPACTS — DONNÉES CRITIQUES

Les champs suivants pèsent fort/moyen sur la valorisation :
${gapsText}

Quand ces champs sont inconnus, signale l'incertitude dans ton récap final et continue.`;
}

/**
 * Addendum SPÉCIFIQUE au chemin Kimi/Moonshot à APPEL UNIQUE.
 *
 * Kimi (moonshot-v1/kimi) renvoie SOIT du texte SOIT un appel d'outil, jamais
 * les deux dans une même réponse. Pour obtenir conversation ET données en UN
 * SEUL appel, on force un outil unique `reply_and_record` qui porte la réponse
 * visible dans `message` ET les champs de données. Cet addendum redéfinit donc
 * le canal de sortie : tout passe par l'outil.
 */
const KIMI_TOOL_ADDENDUM = `## CANAL DE SORTIE — APPEL UNIQUE (IMPORTANT)

Tu réponds EXCLUSIVEMENT en appelant l'outil \`reply_and_record\` UNE seule fois. Tu n'écris AUCUN texte libre en dehors de l'outil. (Cela remplace la règle 0 ci-dessus : ta "réponse texte" vit désormais dans le champ \`message\`.)

⚠️ Émets le champ \`message\` en TOUT PREMIER dans l'appel d'outil (avant tous les autres champs) — il s'affiche en streaming au vendeur.

- \`message\` : ta réponse VISIBLE au vendeur, en français, JAMAIS vide — accusé de réception bref + 2-4 questions (liste numérotée, mots-clés en gras, lecture aérée) OU le récap final. Respecte la mise en forme définie plus haut.
- Autres champs : les données apprises ce tour. ⚠️ N'OUBLIE JAMAIS un champ explicitement donné — surtout \`type_bien\`, \`surface_habitable_m2\` et la localisation (\`ville\`/\`adresse\`) : extrais-les SYSTÉMATIQUEMENT dès qu'ils apparaissent, et ré-inclus \`type_bien\`, \`ville\` et \`surface_habitable_m2\` à chaque tour tant qu'ils sont connus. Données ignorées par le vendeur → \`to_confirm[]\`. Options cliquables → \`suggestions[]\` (1er champ fermé non répondu).

### Mapping enums STRICT (valeurs exactes attendues)
- type_bien : appartement | maison | immeuble | local_commercial | terrain | autre
- exposition : nord | sud | est | ouest | sud_est | sud_ouest | nord_est | nord_ouest | traversant
- etat_general : a_renover | rafraichissement | bon | renove_recemment | neuf
- qualite_renovation : superficielle | structurelle
- dpe_classe / ges_classe : A | B | C | D | E | F | G
- stationnement : aucun | place_exterieure | place_sous_sol | box | garage | plusieurs
- occupation : libre | loue | residence_principale
- Booléens (ascenseur, cave, meuble, meuble_inclus, travaux_votes, surface_carrez_confirmee) : true / false
- Nombres (surfaces, pièces, chambres, étage, charges, loyer, années) : valeur numérique seule
- "exposition sud" → exposition:"sud" (PAS dans vue). "vue dégagée/mer" → vue.

N'invente jamais une valeur non fournie. N'émets que les champs réellement déduits ce tour.`;

// ─── Agnostic stream turn ─────────────────────────────────────────────────────

type Message = { role: "user" | "assistant"; content: string };

interface StreamInterviewTurnParams {
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
  onText: (delta: string) => void;
  /** Raisonnement du modèle (canal `reasoning_content` de Kimi) — feedback live. */
  onReasoning?: (delta: string) => void;
}

interface StreamInterviewTurnResult {
  assistantText: string;
  toolInput: unknown | null;
  stopReason: string;
  /** Tokens consommés (défini uniquement sur le chemin Anthropic). */
  usage?: TraceUsage;
}

/**
 * Lance un tour d'entretien en streaming, provider-agnostique.
 *
 * Choix du provider :
 *   - INTERVIEW_MODEL commence par "kimi" → chemin OpenAI/Kimi (Moonshot ou Hypercli)
 *   - Pas d'ANTHROPIC_API_KEY → chemin OpenAI/Kimi
 *   - Sinon → chemin Anthropic
 *
 * onText : callback appelé pour chaque delta de texte.
 * Retourne : { assistantText, toolInput (null si absent/tronqué), stopReason }.
 */
export async function streamInterviewTurn(
  params: StreamInterviewTurnParams
): Promise<StreamInterviewTurnResult> {
  const { system, history, stateHeader, userMessage, onText, onReasoning } = params;
  const model = process.env.INTERVIEW_MODEL ?? INTERVIEW_MODEL;
  const useKimi = usesKimiPath(model);

  // Observabilité Langfuse — no-op si non configuré, jamais bloquant.
  let t: ReturnType<typeof trace> = { end: () => {} };
  try {
    // Le message du vendeur peut porter de la PII (adresse complète, nom, email,
    // téléphone). On le scrub AVANT de l'envoyer à l'observabilité Langfuse —
    // adresse/rue/email/GPS masqués par scrubSecrets.
    t = trace(
      "interview-turn",
      { model, userMessage: scrubSecrets(params.userMessage) },
      { provider: useKimi ? "kimi" : "anthropic", model },
    );
  } catch {
    // trace() ne doit jamais faire planter le tour — on retombe sur le no-op.
  }

  let result: StreamInterviewTurnResult | null = null;
  try {
    if (useKimi) {
      result = await _streamKimiTurn({ system, history, stateHeader, userMessage, onText, onReasoning, model });
    } else {
      result = await _streamAnthropicTurn({ system, history, stateHeader, userMessage, onText });
    }
    return result;
  } finally {
    t.end(
      {
        stopReason: result?.stopReason,
        hasToolInput: result?.toolInput !== null && result?.toolInput !== undefined,
        assistantTextLength: result?.assistantText?.length ?? 0,
      },
      result?.usage,
    );
  }
}

// ─── Kimi / OpenAI path — APPEL UNIQUE ────────────────────────────────────────

/**
 * Outil UNIQUE pour le chemin Kimi : porte la réponse visible (`message`) ET
 * toutes les données apprises dans le MÊME appel forcé. Un seul aller-retour LLM
 * par tour collecte les données ET répond au vendeur.
 */
const openAiReplyAndRecordTool = {
  type: "function" as const,
  function: {
    name: "reply_and_record",
    description:
      "Réponds au vendeur ET enregistre les données apprises EN UN SEUL appel. `message` = réponse visible en français (jamais vide). Les autres champs = données apprises ce tour uniquement ; ce que le vendeur ignore → to_confirm[] ; options cliquables → suggestions[].",
    parameters: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description:
            "Réponse VISIBLE au vendeur, en français, JAMAIS vide : accusé de réception bref + 2-4 questions (liste numérotée, mots-clés en gras, aéré) OU récap final.",
        },
        ...recordPropertyDataTool.input_schema.properties,
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
};

/**
 * Extracteur INCRÉMENTAL du champ `message` depuis le flux d'arguments JSON
 * (forcé tool). Re-décode tout le buffer à chaque appel et n'émet que le NOUVEAU
 * suffixe → streaming token-par-token du texte visible, sans jamais émettre du
 * JSON partiel non fiable. S'arrête proprement sur un escape/unicode incomplet
 * (le chunk suivant complète).
 */
function makeMessageStreamer(onText: (delta: string) => void) {
  let emitted = 0;
  let finished = false;

  return (fullArgs: string) => {
    if (finished) return;
    const keyIdx = fullArgs.indexOf('"message"');
    if (keyIdx < 0) return;
    let i = fullArgs.indexOf(":", keyIdx + 9);
    if (i < 0) return;
    i++;
    while (i < fullArgs.length && /\s/.test(fullArgs[i])) i++;
    if (i >= fullArgs.length || fullArgs[i] !== '"') return; // valeur string pas encore ouverte
    let j = i + 1;
    let decoded = "";
    let closed = false;
    while (j < fullArgs.length) {
      const c = fullArgs[j];
      if (c === "\\") {
        if (j + 1 >= fullArgs.length) break; // escape incomplet → on attend
        const n = fullArgs[j + 1];
        if (n === "u") {
          if (j + 6 > fullArgs.length) break; // \uXXXX incomplet → on attend
          decoded += String.fromCharCode(parseInt(fullArgs.slice(j + 2, j + 6), 16));
          j += 6;
          continue;
        }
        const map: Record<string, string> = {
          n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/",
        };
        decoded += map[n] ?? n;
        j += 2;
        continue;
      }
      if (c === '"') {
        closed = true;
        break;
      }
      decoded += c;
      j++;
    }
    if (decoded.length > emitted) {
      onText(decoded.slice(emitted));
      emitted = decoded.length;
    }
    if (closed) finished = true;
  };
}

async function _streamKimiTurn(params: {
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
  onText: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  model: string;
}): Promise<StreamInterviewTurnResult> {
  const { system, history, stateHeader, userMessage, onText, onReasoning, model } = params;

  const userContent = stateHeader
    ? `${stateHeader}\n\n${userMessage}`
    : userMessage;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: `${system}\n\n${KIMI_TOOL_ADDENDUM}` },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  // UN SEUL appel : tool_choice forcé sur `reply_and_record`. On streame le
  // champ `message` (texte visible) depuis les deltas d'arguments JSON ; les
  // autres champs (données) sont parsés une fois le flux complet.
  let argsBuffer = "";
  let stopReason = "end_turn";
  const pumpMessage = makeMessageStreamer(onText);

  const stream = await kimi.chat.completions.create({
    model,
    stream: true,
    max_tokens: INTERVIEW_MAX_TOKENS,
    messages,
    tools: [openAiReplyAndRecordTool],
    tool_choice: {
      type: "function",
      function: { name: openAiReplyAndRecordTool.function.name },
    },
  });

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (!choice) continue;

    const reasoningDelta =
      (choice.delta as { reasoning_content?: string })?.reasoning_content ?? "";
    if (reasoningDelta && onReasoning) onReasoning(reasoningDelta);

    const argDelta = choice.delta?.tool_calls?.[0]?.function?.arguments ?? "";
    if (argDelta) {
      argsBuffer += argDelta;
      pumpMessage(argsBuffer);
    }

    if (choice.finish_reason) stopReason = choice.finish_reason;
  }

  // Parse final → données structurées. `message` retiré du tool_input persisté
  // (c'est du texte, pas une donnée du bien). Suggestions/to_confirm conservés.
  let assistantText = "";
  let toolInput: unknown | null = null;
  try {
    const parsed = JSON.parse(argsBuffer) as Record<string, unknown>;
    if (typeof parsed.message === "string") assistantText = parsed.message;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { message: _msg, ...data } = parsed;
    toolInput = data;
  } catch {
    // Args tronqués/malformés (souvent stopReason "length") : on ne merge pas,
    // mais le texte déjà streamé reste affiché côté vendeur.
    toolInput = null;
  }

  return { assistantText, toolInput, stopReason };
}

// ─── Anthropic path ───────────────────────────────────────────────────────────

async function _streamAnthropicTurn(params: {
  system: string;
  history: Message[];
  stateHeader: string;
  userMessage: string;
  onText: (delta: string) => void;
}): Promise<StreamInterviewTurnResult> {
  const { system, history, stateHeader, userMessage, onText } = params;

  const client = getInterviewClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: stateHeader ? `${stateHeader}\n\n${userMessage}` : userMessage,
    },
  ];

  const stream = client.messages.stream({
    model: INTERVIEW_MODEL,
    max_tokens: INTERVIEW_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [recordPropertyDataTool],
    tool_choice: { type: "auto" },
    messages,
  });

  stream.on("text", onText);

  const finalMessage = await stream.finalMessage();
  const stopReason = finalMessage.stop_reason ?? "end_turn";
  const isTruncated = stopReason === "max_tokens";

  const toolUseBlock = isTruncated
    ? null
    : finalMessage.content.find(
        (b): b is Extract<typeof b, { type: "tool_use" }> =>
          b.type === "tool_use" && b.name === "record_property_data"
      ) ?? null;

  let assistantText = "";
  for (const block of finalMessage.content) {
    if (block.type === "text") assistantText += block.text;
  }

  const usage: TraceUsage | undefined =
    finalMessage.usage
      ? {
          input: finalMessage.usage.input_tokens,
          output: finalMessage.usage.output_tokens,
          model: INTERVIEW_MODEL,
        }
      : undefined;

  return {
    assistantText,
    toolInput: toolUseBlock ? toolUseBlock.input : null,
    stopReason,
    usage,
  };
}

// ─── Merge tool input ─────────────────────────────────────────────────────────

/**
 * Valide et merge le tool_input dans la copie de property + fieldStatus.
 *
 * Stratégie RÉSILIENTE (champ par champ, pas tout-ou-rien) :
 * - Chaque clé connue est validée contre SON schéma de champ ; les champs
 *   valides sont conservés, les invalides/inconnus ignorés silencieusement.
 *   Un seul champ mal typé par le LLM ne fait donc PLUS perdre tout le tour.
 * - Pour chaque clé apprise → fieldStatus = "answered".
 * - Pour chaque clé dans to_confirm → fieldStatus = "to_confirm".
 *
 * IMPORTANT : appeler UNIQUEMENT sur un tool_input complet (jamais sur des deltas partiels).
 */
const PROPERTY_SHAPE = PropertyDataSchema.shape;

/** Valeur-placeholder « inconnu » que l'extraction ne doit JAMAIS écrire comme
 * valeur réelle (sinon elle écrase une bonne donnée d'un tour précédent). */
const UNKNOWN_RE = /^(je ne sais pas|jnsp|inconnu(e)?|non (précis|renseign|communiqu)\w*|non d[ée]fini\w*|n\/?a|ras|à confirmer|\?+|-)$/i;

export function mergeToolInput(
  property: PropertyData,
  fieldStatus: FieldStatusMap,
  toolInput: unknown
): { property: PropertyData; fieldStatus: FieldStatusMap } {
  const newProperty = { ...property } as Record<string, unknown>;
  const newFieldStatus: FieldStatusMap = { ...fieldStatus };

  if (toolInput == null || typeof toolInput !== "object") {
    return { property: newProperty as PropertyData, fieldStatus: newFieldStatus };
  }

  const input = toolInput as Record<string, unknown>;

  // Champs métier : validés individuellement contre leur propre schéma.
  for (const [key, fieldSchema] of Object.entries(PROPERTY_SHAPE)) {
    if (!(key in input)) continue;
    const raw = input[key];
    if (raw === undefined || raw === null) continue;
    // Placeholder "inconnu" en string → on n'écrase pas une vraie valeur ;
    // on marque le champ à confirmer plutôt.
    if (typeof raw === "string" && UNKNOWN_RE.test(raw.trim())) {
      if (newFieldStatus[key as keyof PropertyData] !== "answered") {
        newFieldStatus[key as keyof PropertyData] = "to_confirm";
      }
      continue;
    }
    const r = (fieldSchema as { safeParse: (v: unknown) => { success: boolean; data?: unknown } }).safeParse(raw);
    if (!r.success) continue; // champ mal typé → ignoré, le reste passe
    newProperty[key] = r.data;
    newFieldStatus[key as keyof PropertyData] = "answered";
  }

  // Champs que le vendeur ne connaît pas → to_confirm.
  const toConfirm = input.to_confirm;
  if (Array.isArray(toConfirm)) {
    for (const k of toConfirm) {
      if (typeof k !== "string") continue;
      if (!(k in PROPERTY_SHAPE)) continue;
      if (newFieldStatus[k as keyof PropertyData] !== "answered") {
        newFieldStatus[k as keyof PropertyData] = "to_confirm";
      }
    }
  }

  return {
    property: newProperty as PropertyData,
    fieldStatus: newFieldStatus,
  };
}
