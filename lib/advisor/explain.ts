import type { AdvisorResult, Recommendation } from "./recommend";
import { formatCostRange, formatINR } from "./recommend";
import type { ExplanationContext } from "./ollama";
import { goalLabel } from "./intent";
import type { Goal } from "./data";
import { ENGINE_TYPES } from "./data";

/** Per-item and combo budget facts — computed in code, never by the LLM. */
export type BudgetItemFact = {
  name: string;
  costMin: number;
  costMax: number;
  /** Whole range fits the ceiling (costMax ≤ budget). */
  fitsAlone: boolean;
  minFits: boolean;
  maxFits: boolean;
};

export type BudgetFacts = {
  /** null when the ceiling is open (Infinity). */
  budgetMax: number | null;
  items: BudgetItemFact[];
  /** Greedy combo by best-value order, charging each item's max price. */
  comboWithinBudget: string[];
  comboMaxTotal: number;
};

/**
 * Budget fit for each recommended item + a greedy combo that stays under
 * the ceiling. Recommendations are already sorted best-value first.
 */
export function computeBudgetFacts(
  recommendations: Recommendation[],
  budgetMax: number
): BudgetFacts {
  const open = !Number.isFinite(budgetMax) || budgetMax === Number.POSITIVE_INFINITY;
  const items: BudgetItemFact[] = recommendations.map((r) => {
    const maxFits = open || r.costMax <= budgetMax;
    const minFits = open || r.costMin <= budgetMax;
    return {
      name: r.name,
      costMin: r.costMin,
      costMax: r.costMax,
      fitsAlone: maxFits,
      minFits,
      maxFits,
    };
  });

  const comboWithinBudget: string[] = [];
  let comboMaxTotal = 0;
  for (const r of recommendations) {
    if (open || comboMaxTotal + r.costMax <= budgetMax) {
      comboWithinBudget.push(r.name);
      comboMaxTotal += r.costMax;
    }
  }

  return {
    budgetMax: open ? null : budgetMax,
    items,
    comboWithinBudget,
    comboMaxTotal,
  };
}

/** Facts the LLM is allowed to mention (from the rule engine only). */
export type AllowedFacts = {
  partNames: string[];
  /** Digit strings that appear in allowed prices (e.g. "3500", "8,000"). */
  priceTokens: string[];
  trades: string[];
};

export function allowedFactsFromResult(
  result: AdvisorResult,
  extraAmounts: number[] = []
): AllowedFacts {
  const partNames = result.recommendations.map((r) => r.name);
  const trades = result.recommendations.map((r) => r.installer.trade);
  const priceTokens = new Set<string>();
  const amounts = [
    ...result.recommendations.flatMap((r) => [r.costMin, r.costMax]),
    ...extraAmounts.filter((n) => Number.isFinite(n) && n > 0 && n !== Number.POSITIVE_INFINITY),
  ];
  for (const n of amounts) {
    priceTokens.add(String(n));
    priceTokens.add(n.toLocaleString("en-IN"));
    priceTokens.add(formatINR(n).replace(/^₹/, ""));
  }
  return { partNames, priceTokens: [...priceTokens], trades };
}

/** ₹ amounts / digit groups that look like money in the explanation. */
export function extractMentionedPrices(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/(?:₹|Rs\.?\s*)\s*([\d,]+(?:\.\d+)?)/gi)) {
    found.push(m[1].replace(/,/g, ""));
  }
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{2,3})+|\d{4,})\b/g)) {
    const raw = m[1].replace(/,/g, "");
    const n = Number(raw);
    // Skip years and tiny numbers
    if (n >= 1900 && n <= 2099) continue;
    if (n < 1000) continue;
    found.push(raw);
  }
  return found;
}

/**
 * Reject LLM text that invents prices or part names not in the rule output.
 * Returns null when the text is safe; otherwise a short reason.
 */
export function findInventedClaims(
  explanation: string,
  allowed: AllowedFacts
): string | null {
  const lower = explanation.toLowerCase();

  // Invented prices
  const mentioned = extractMentionedPrices(explanation);
  const allowedNums = new Set(
    allowed.priceTokens.map((t) => t.replace(/,/g, "")).filter((t) => /^\d+$/.test(t))
  );
  for (const p of mentioned) {
    if (!allowedNums.has(p)) {
      return `invented price ${p}`;
    }
  }

  // Known catalogue part names that appear but are NOT in this result
  // (only flag when a full curated name shows up unexpectedly).
  // We import lazily via the names already on allowed — scan for other
  // UPGRADES names is done by the caller passing allKnownPartNames.
  return null;
}

const NEG_BUDGET =
  /\b(?:does not fit|doesn't fit|do not fit|don't fit|not fitting|is over budget|are over budget|over budget|exceeds?|not within|outside (?:the |your )?budget|beyond (?:the |your )?budget|too (?:expensive|costly) for (?:the |your )?budget)\b/i;

const POS_BUDGET =
  /\b(?:fits? (?:within|under|inside|in)|within (?:the |your )?budget|under (?:the |your )?budget|inside (?:the |your )?budget|within your ₹|fits your budget)\b/i;

function sentenceMentionsName(sentence: string, name: string): boolean {
  const sl = sentence.toLowerCase();
  const full = name.toLowerCase();
  if (sl.includes(full)) return true;
  // Distinctive chunk (≥12 chars) from the name, e.g. "cold-air / performance intake"
  const chunk = full.replace(/[^a-z0-9]+/g, " ").trim();
  if (chunk.length >= 12 && sl.includes(chunk)) return true;
  const words = chunk.split(" ").filter((w) => w.length >= 5);
  if (words.length >= 2) {
    const hit = words.filter((w) => sl.includes(w)).length;
    if (hit >= Math.min(2, words.length)) return true;
  }
  return false;
}

/**
 * Reject explanations that contradict computed budget facts
 * (e.g. "X does not fit your ₹50k budget" when X.max ≤ 50k).
 */
export function findFalseBudgetClaims(
  explanation: string,
  budgetFacts: BudgetFacts
): string | null {
  const sentences = explanation.split(/(?<=[.!?])\s+/);
  for (const item of budgetFacts.items) {
    for (const sentence of sentences) {
      if (!sentenceMentionsName(sentence, item.name)) continue;
      if (item.maxFits && NEG_BUDGET.test(sentence)) {
        return `false over-budget claim for "${item.name}"`;
      }
      if (!item.minFits && POS_BUDGET.test(sentence)) {
        return `false under-budget claim for "${item.name}"`;
      }
    }
  }
  return null;
}

/**
 * Broader check: also reject known upgrade names that are not in this result,
 * brand-y tokens, and false budget-fit claims.
 */
export function postCheckExplanation(
  explanation: string,
  allowed: AllowedFacts,
  allKnownPartNames: string[],
  budgetFacts?: BudgetFacts | null
): { ok: true } | { ok: false; reason: string } {
  const priceHit = findInventedClaims(explanation, allowed);
  if (priceHit) return { ok: false, reason: priceHit };

  if (budgetFacts) {
    const budgetHit = findFalseBudgetClaims(explanation, budgetFacts);
    if (budgetHit) return { ok: false, reason: budgetHit };
  }

  const lower = explanation.toLowerCase();
  for (const name of allKnownPartNames) {
    if (allowed.partNames.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
    // Require a substantial name match (≥12 chars) to avoid false positives.
    if (name.length < 12) continue;
    if (lower.includes(name.toLowerCase())) {
      return { ok: false, reason: `invented part "${name}"` };
    }
  }

  // Common invented brand tokens not present in allowed part names / trades.
  const brandHints = [
    "bilstein",
    "kw suspension",
    "borsa",
    "akrapovic",
    "magnaflow",
    "cobb",
    "apr stage",
    "garrett",
    "bosch motorsport",
  ];
  const allowedBlob = [...allowed.partNames, ...allowed.trades].join(" ").toLowerCase();
  for (const brand of brandHints) {
    if (lower.includes(brand) && !allowedBlob.includes(brand)) {
      return { ok: false, reason: `invented brand "${brand}"` };
    }
  }

  return { ok: true };
}

export function buildExplanationContext(
  carName: string,
  goal: Goal,
  budgetMax: number,
  result: AdvisorResult
): ExplanationContext {
  const budgetLabel =
    budgetMax === Number.POSITIVE_INFINITY ? "no fixed ceiling" : `up to ${formatINR(budgetMax)}`;
  const budgetFacts = computeBudgetFacts(result.recommendations, budgetMax);
  return {
    carName,
    goalLabel: goalLabel(goal),
    budgetLabel,
    engineLabel: ENGINE_TYPES.find((e) => e.key === result.engineType)?.label ?? result.engineType,
    warnings: result.warnings,
    budgetFacts,
    parts: result.recommendations.map((r: Recommendation) => ({
      name: r.name,
      costMin: r.costMin,
      costMax: r.costMax,
      fitment: r.fitmentLabel,
      benefit: r.benefit,
      installerTrade: r.installer.trade,
      fitsAlone: budgetFacts.items.find((i) => i.name === r.name)?.fitsAlone ?? true,
    })),
  };
}

/** Deterministic explanation when LLM is off or fails the post-check. */
export function templateExplanation(
  carName: string,
  goal: Goal,
  budgetMax: number,
  result: AdvisorResult
): string {
  const g = goalLabel(goal);
  const budget =
    budgetMax === Number.POSITIVE_INFINITY ? "your open budget" : `up to ${formatINR(budgetMax)}`;
  if (result.recommendations.length === 0) {
    return `Nothing in our curated list for ${carName} fits ${g.toLowerCase()} within ${budget} without cutting corners we won't recommend. Try a higher budget, or pick another goal — brakes and tyres usually give the most for the least money.`;
  }
  const facts = computeBudgetFacts(result.recommendations, budgetMax);
  const top = result.recommendations.slice(0, 3);
  const lines = top.map(
    (r) =>
      `${r.name} (${formatCostRange(r.costMin, r.costMax)}; ${r.fitment === "diy" ? "DIY-friendly" : r.fitment === "mechanic" ? "needs a mechanic" : "needs a specialist shop"})`
  );
  const combo =
    facts.comboWithinBudget.length > 0 && facts.budgetMax !== null
      ? ` A sensible combo within ${budget} (using each item's max price, best value first): ${facts.comboWithinBudget.join(", ")} — about ${formatINR(facts.comboMaxTotal)} together.`
      : "";
  const warn =
    result.warnings.length > 0 ? ` Note: ${result.warnings[0]}` : "";
  return `For your ${carName}, aiming at ${g.toLowerCase()} within ${budget}, each listed option fits that ceiling on its own. Top picks: ${lines.join("; ")}.${combo} Costs are curated ranges (parts + typical fitting), not live prices.${warn}`;
}
