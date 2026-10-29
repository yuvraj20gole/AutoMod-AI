import type { EngineType, Goal } from "./data";

/**
 * Free-text request parser for the Upgrade Advisor.
 *
 * Pure keyword + number matching — deterministic, no AI, no network.
 * Returns only the fields the sentence actually answers; the chat
 * skips steps that are already answered and asks for the rest.
 */
export type ParsedRequest = {
  goal?: Goal;
  budgetMax?: number;
  engine?: EngineType;
};

/** Keyword → goal. Matching is prefix-based ("brake" also catches
 *  "brakes", "loud" catches "louder", "look" catches "looking"). */
const GOAL_KEYWORDS: { goal: Goal; keywords: string[] }[] = [
  { goal: "power", keywords: ["power", "hp", "horsepower", "faster", "tune", "remap"] },
  { goal: "exhaust", keywords: ["exhaust", "sound", "loud"] },
  { goal: "suspension", keywords: ["suspension", "handling", "lower", "coilover", "stiff"] },
  { goal: "brakes", keywords: ["brake", "stopping"] },
  { goal: "wheels", keywords: ["wheel", "rim", "tyre", "tire"] },
  { goal: "looks", keywords: ["light", "headlight", "led", "look", "style"] },
];

function firstKeywordIndex(text: string, keyword: string): number {
  const m = new RegExp(`\\b${keyword}`).exec(text);
  return m ? m.index : -1;
}

/** The goal whose keyword appears earliest in the sentence wins, so
 *  "better stopping power" is brakes, not power. */
function parseGoal(text: string): Goal | undefined {
  let best: Goal | undefined;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const { goal, keywords } of GOAL_KEYWORDS) {
    for (const kw of keywords) {
      const i = firstKeywordIndex(text, kw);
      if (i !== -1 && i < bestIndex) {
        bestIndex = i;
        best = goal;
      }
    }
  }
  return best;
}

function parseBudget(text: string): number | undefined {
  const candidates: number[] = [];

  // "1 lakh", "1.5 lakhs", "2 lac" → × 100,000
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?)\b/g)) {
    candidates.push(parseFloat(m[1]) * 100_000);
  }
  // "1 crore" → × 10,000,000
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:crores?|cr)\b/g)) {
    candidates.push(parseFloat(m[1]) * 10_000_000);
  }
  // "50k" → × 1,000
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*k\b/g)) {
    candidates.push(parseFloat(m[1]) * 1_000);
  }
  // "30 thousand" → × 1,000
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:thousand|grand)\b/g)) {
    candidates.push(parseFloat(m[1]) * 1_000);
  }
  // Plain amounts: "50,000", "1,00,000", "Rs 50000", "₹50000", "below 80000"
  for (const m of text.matchAll(/(?:rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d{4,})/g)) {
    const value = parseInt(m[1].replace(/,/g, ""), 10);
    // A bare 4-digit number in year range is a model year, not a budget.
    if (!m[1].includes(",") && value >= 1900 && value <= 2099) continue;
    candidates.push(value);
  }

  const sane = candidates.filter((n) => Number.isFinite(n) && n >= 1_000 && n <= 100_000_000);
  if (sane.length === 0) return undefined;
  // If several amounts appear ("can stretch to…"), the ceiling is the largest.
  return Math.round(Math.max(...sane));
}

function parseEngine(text: string): EngineType | undefined {
  if (/\bnaturally\s+aspirated\b/.test(text) || /\bna\b/.test(text)) return "petrol_na";
  if (/\bturbo\b/.test(text)) return "petrol_turbo";
  if (/\bdiesel\b/.test(text)) return "diesel";
  if (/\bpetrol\b/.test(text)) return "petrol_na";
  return undefined;
}

export function parseRequest(input: string): ParsedRequest {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return {};
  const parsed: ParsedRequest = {};
  const goal = parseGoal(text);
  if (goal) parsed.goal = goal;
  const budgetMax = parseBudget(text);
  if (budgetMax !== undefined) parsed.budgetMax = budgetMax;
  const engine = parseEngine(text);
  if (engine) parsed.engine = engine;
  return parsed;
}
