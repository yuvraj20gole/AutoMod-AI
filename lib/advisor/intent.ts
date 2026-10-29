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
    .enum(["recommend", "cheaper", "follow_up", "clarify", "other"])
    .optional()
    .default("recommend"),
  /** Optional; rule parser / prior turn may also supply this. */
  engine: z.enum(["petrol_na", "petrol_turbo", "diesel"]).nullable().optional(),
});

export type AdvisorIntent = z.infer<typeof IntentSchema>;

export type ChatMessage = { role: "user" | "assistant"; content: string };

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
