import { z } from "zod";
import type { EngineType, Goal } from "./data";
import { GOALS } from "./data";
import { parseRequest } from "./parse";

/**
 * Structured intent the local LLM must return. Validated with zod;
 * invalid JSON → retry once → fall back to parse.ts.
 */
export const IntentSchema = z.object({
  goal: z
    .enum(["power", "exhaust", "suspension", "brakes", "wheels", "looks"])
    .nullable()
    .optional(),
  /** Ceiling in ₹, or a short phrase like "50k" / "cheaper". */
  budget: z.union([z.number(), z.string(), z.null()]).optional(),
  car: z.string().nullable().optional(),
  parts: z.array(z.string()).optional().default([]),
  style: z.string().nullable().optional(),
  question_type: z
    .enum([
      "recommend",
      "cheaper",
      "follow_up",
      "clarify",
      "other",
      /** Car specs / capability questions the rule engine cannot answer. */
      "off_topic_car_info",
    ])
    .optional()
    .default("recommend"),
  /** Optional; rule parser / prior turn may also supply this. */
  engine: z.enum(["petrol_na", "petrol_turbo", "diesel"]).nullable().optional(),
});

export type AdvisorIntent = z.infer<typeof IntentSchema>;

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** First reply when the user asks for stock engine / power / mileage / trim. */
export const FALLBACK_CAR_INFO =
  "I only have your car's make, model and year, so I can't confirm its engine or specs. I can plan upgrades for it though. Try one of the suggestions below.";

/** Second (or unrelated) reply — upgrade-only redirect. */
export const FALLBACK_UPGRADE_ONLY =
  "I can only help with upgrade ideas, parts and budgets. Pick a suggestion below or tell me a goal, like more power, better brakes or looks.";

const GENERIC_UPGRADE_ASK =
  /^what do you want to upgrade/i;

/** True when the last assistant line was already a non-upgrade fallback. */
export function isAdvisorFallbackMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t === FALLBACK_CAR_INFO || t === FALLBACK_UPGRADE_ONLY) return true;
  if (GENERIC_UPGRADE_ASK.test(t)) return true;
  return false;
}

/**
 * Pick the fixed fallback line. If the previous assistant message was already
 * a fallback, vary to FALLBACK_UPGRADE_ONLY so we never repeat the same line.
 */
export function nextFallbackMessage(
  history: ChatMessage[],
  kind: "off_topic_car_info" | "other"
): string {
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && isAdvisorFallbackMessage(lastAssistant.content)) {
    return FALLBACK_UPGRADE_ONLY;
  }
  return kind === "off_topic_car_info" ? FALLBACK_CAR_INFO : FALLBACK_UPGRADE_ONLY;
}

/**
 * Detect questions that are not upgrade requests.
 * Returns off_topic_car_info for stock specs / capability, other for unrelated,
 * or null when the text looks like a normal upgrade turn.
 */
export function classifyNonUpgrade(
  userText: string
): "off_topic_car_info" | "other" | null {
  const t = userText.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Clear upgrade / budget signals win.
  if (/\b(under|within|below)\s+(?:rs\.?|₹|inr)?\s*\d/i.test(t)) return null;
  if (/\b(more power|upgrade|recommend|cheaper|suggest (?:parts|upgrades))\b/.test(t)) {
    return null;
  }
  if (/\b(i want|i need|looking for|can you (?:suggest|recommend)|please (?:suggest|recommend))\b/.test(t)) {
    return null;
  }

  // Stock specs / capability — rule engine has make/model/year only.
  if (
    /\b(?:what|which|current)\s+(?:is\s+)?(?:the\s+)?(?:engine|trim|variant|mileage|specs?)\b/.test(
      t
    )
  ) {
    return "off_topic_car_info";
  }
  if (/\bhow\s+much\s+(?:power|hp|bhp|horsepower|torque|mileage)\b/.test(t)) {
    return "off_topic_car_info";
  }
  if (
    /\b(?:engine|mileage|trim|variant|specs?)\s+(?:in|of|on|for)\s+(?:my|the|this)\b/.test(t)
  ) {
    return "off_topic_car_info";
  }
  if (/\bwhat(?:'s| is|s)?\s+(?:the\s+)?(?:current\s+)?engine\b/.test(t)) {
    return "off_topic_car_info";
  }
  if (/\b(?:good|suitable|ready)\s+for\s+(?:the\s+)?track\b/.test(t)) {
    return "off_topic_car_info";
  }
  if (/\bis\s+it\s+(?:any\s+)?good\s+for\b/.test(t)) return "off_topic_car_info";
  if (/\b(?:stock|factory|oem)\s+(?:power|hp|engine|specs?|mileage)\b/.test(t)) {
    return "off_topic_car_info";
  }
  if (
    /\b(?:horsepower|bhp|kmpl|fuel\s+economy|displacement)\b/.test(t) &&
    !/\b(?:want|add|upgrade|fit|install)\b/.test(t)
  ) {
    return "off_topic_car_info";
  }
  if (/\bdoes\s+it\s+(?:make|have|come\s+with)\b/.test(t) && /\b(?:power|hp|bhp|engine|torque)\b/.test(t)) {
    return "off_topic_car_info";
  }

  // Unrelated (weather, news, …).
  if (
    /\b(?:weather|forecast|temperature outside|news today|stock market|recipe|cricket score|football score)\b/.test(
      t
    )
  ) {
    return "other";
  }
  if (/\bwhat(?:'s| is|s)\s+the\s+weather\b/.test(t)) return "other";

  return null;
}

/** Keep the last N turns (user+assistant pairs count as messages). */
export function trimHistory(messages: ChatMessage[], max = 6): ChatMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(-max);
}

export function parseIntentJson(raw: string): AdvisorIntent | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  // Prefer first {...} block if the model added prose.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const result = IntentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Turn budget field into a ₹ ceiling using the rule parser when needed. */
export function resolveBudget(
  budget: AdvisorIntent["budget"],
  questionType: AdvisorIntent["question_type"],
  priorBudget: number | null
): number | null {
  if (questionType === "cheaper" && priorBudget !== null && Number.isFinite(priorBudget)) {
    return Math.max(5_000, Math.round(priorBudget * 0.6));
  }
  if (budget === null || budget === undefined || budget === "") return priorBudget;
  if (typeof budget === "number" && Number.isFinite(budget) && budget >= 1_000) {
    return Math.round(budget);
  }
  if (typeof budget === "string") {
    const fromParser = parseRequest(budget).budgetMax;
    if (fromParser !== undefined) return fromParser;
    const n = Number(budget.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n >= 1_000) return Math.round(n);
  }
  return priorBudget;
}

export function resolveGoal(
  intent: AdvisorIntent,
  priorGoal: Goal | null
): Goal | null {
  if (intent.goal) return intent.goal;
  // Map free-text parts hints through the rule keyword parser.
  if (intent.parts && intent.parts.length > 0) {
    const fromParts = parseRequest(intent.parts.join(" ")).goal;
    if (fromParts) return fromParts;
  }
  if (intent.style) {
    const fromStyle = parseRequest(intent.style).goal;
    if (fromStyle) return fromStyle;
  }
  return priorGoal;
}

export function resolveEngine(
  intent: AdvisorIntent,
  priorEngine: EngineType | null
): EngineType | null {
  if (intent.engine) return intent.engine;
  return priorEngine;
}

/** Merge LLM intent with prior turn state (follow-ups keep goal/budget). */
export function mergeIntent(
  intent: AdvisorIntent,
  prior: { goal: Goal | null; budgetMax: number | null; engine: EngineType | null }
): {
  goal: Goal | null;
  budgetMax: number | null;
  engine: EngineType | null;
  question_type: NonNullable<AdvisorIntent["question_type"]>;
} {
  const question_type = intent.question_type ?? "recommend";
  return {
    goal: resolveGoal(intent, prior.goal),
    budgetMax: resolveBudget(intent.budget, question_type, prior.budgetMax),
    engine: resolveEngine(intent, prior.engine),
    question_type,
  };
}

/** Rule-based fallback when the LLM intent is missing/invalid. */
export function intentFromRules(
  userText: string,
  prior: { goal: Goal | null; budgetMax: number | null; engine: EngineType | null }
): ReturnType<typeof mergeIntent> {
  const nonUpgrade = classifyNonUpgrade(userText);
  if (nonUpgrade) {
    // Do not let keyword parsers turn "how much power…" into a power upgrade goal.
    return mergeIntent(
      {
        goal: null,
        budget: null,
        car: null,
        parts: [],
        style: null,
        question_type: nonUpgrade,
        engine: null,
      },
      prior
    );
  }
  const parsed = parseRequest(userText);
  const cheaper = /\b(cheaper|less\s+expensive|lower\s+budget|cut\s+cost)\b/i.test(userText);
  const intent: AdvisorIntent = {
    goal: parsed.goal ?? null,
    budget: parsed.budgetMax ?? null,
    car: null,
    parts: [],
    style: null,
    question_type: cheaper ? "cheaper" : "recommend",
    engine: parsed.engine ?? null,
  };
  return mergeIntent(intent, prior);
}

export function goalLabel(goal: Goal): string {
  return GOALS.find((g) => g.key === goal)?.label ?? goal;
}
