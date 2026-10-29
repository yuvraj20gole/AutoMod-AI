import { UPGRADES, type EngineType, type Goal } from "./data";
import {
  intentFromRules,
  mergeIntent,
  trimHistory,
  type AdvisorIntent,
  type ChatMessage,
} from "./intent";
import {
  allowedFactsFromResult,
  buildExplanationContext,
  computeBudgetFacts,
  postCheckExplanation,
  templateExplanation,
} from "./explain";
import {
  explainWithLlm,
  extractIntentWithLlm,
  probeOllama,
  type OllamaChatOptions,
} from "./ollama";
import { prefilledEngine, recommend, type AdvisorResult, formatINR } from "./recommend";

export type AdvisorChatMode = "local" | "basic";

export type AdvisorChatState = {
  goal: Goal | null;
  budgetMax: number | null;
  engine: EngineType | null;
};

export type AdvisorChatRequest = {
  messages: ChatMessage[];
  car: { make: string; model: string; year: number | null };
  /** Prior structured state from the client (chips / previous turns). */
  state?: Partial<AdvisorChatState>;
  /** Force Basic mode (e.g. Detailed edit running). */
  forceBasic?: boolean;
  ollama?: OllamaChatOptions;
};

export type AdvisorChatResponse = {
  mode: AdvisorChatMode;
  model: string | null;
  statusLabel: string;
  intent: AdvisorIntent | null;
  state: AdvisorChatState;
  result: AdvisorResult | null;
  explanation: string;
  explanationSource: "llm" | "template";
  needs: { goal: boolean; engine: boolean; budget: boolean };
  ask: string | null;
};

function carName(car: AdvisorChatRequest["car"]): string {
  return `${car.year ? `${car.year} ` : ""}${car.make} ${car.model}`;
}

function needsAsk(
  state: AdvisorChatState,
  prefilledEngine: EngineType | null
): { needs: AdvisorChatResponse["needs"]; ask: string | null } {
  const needs = {
    goal: !state.goal,
    engine: !state.engine && !prefilledEngine,
    budget: state.budgetMax === null,
  };
  if (needs.goal) {
    return {
      needs: { ...needs, engine: !state.engine },
      ask: "What do you want to upgrade — more power, exhaust, suspension, brakes, wheels, or looks?",
    };
  }
  if (!state.engine) {
    // Will use prefilled if present; still ask to confirm when unknown.
    if (!prefilledEngine) {
      return {
        needs,
        ask: "What engine does your car have — petrol naturally aspirated, petrol turbo, or diesel?",
      };
    }
  }
  if (needs.budget) {
    return {
      needs: { goal: false, engine: false, budget: true },
      ask: "What is your budget? I'll only show options whose whole cost range fits inside it.",
    };
  }
  return { needs: { goal: false, engine: false, budget: false }, ask: null };
}

export type RunAdvisorChatHooks = {
  onToken?: (t: string) => void;
  /** Override LLM explanation (tests). */
  explainFn?: (
    ctx: ReturnType<typeof buildExplanationContext>
  ) => Promise<string>;
  /** Override intent extraction (tests). */
  intentFn?: (
    history: ChatMessage[],
    userText: string,
    carCtx: string
  ) => Promise<AdvisorIntent | null>;
};

/**
 * One advisor turn: intent → rule engine → explanation.
 * Never throws for Ollama failures — falls back to Basic mode.
 */
export async function runAdvisorChat(
  req: AdvisorChatRequest,
  hooks: RunAdvisorChatHooks = {}
): Promise<AdvisorChatResponse> {
  const history = trimHistory(req.messages.filter((m) => m.content.trim()), 6);
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content?.trim() ?? "";
  const prior: AdvisorChatState = {
    goal: req.state?.goal ?? null,
    budgetMax: req.state?.budgetMax ?? null,
    engine: req.state?.engine ?? null,
  };

  const catalogueEngine = prefilledEngine(req.car.make, req.car.model);

  let mode: AdvisorChatMode = "basic";
  let model: string | null = null;
  let intent: AdvisorIntent | null = null;
  let intentFromLlm = false;

  if (!req.forceBasic) {
    const probe = await probeOllama(req.ollama);
    if (probe.ok && probe.model) {
      model = probe.model;
      if (hooks.intentFn) {
        intent = await hooks.intentFn(history, userText, carName(req.car));
      } else {
        intent = await extractIntentWithLlm(history, userText, carName(req.car), {
          ...req.ollama,
          model: probe.model,
        });
      }
      if (intent) {
        mode = "local";
        intentFromLlm = true;
      } else {
        // Ollama up but JSON failed after retry — keep local for explanation.
        mode = "local";
      }
    }
  }

  if (!intent) {
    // Rule fallback (also when forceBasic / Ollama down / bad JSON).
    const merged = intentFromRules(userText, prior);
    intent = {
      goal: merged.goal,
      budget: merged.budgetMax,
      car: carName(req.car),
      parts: [],
      style: null,
      question_type: merged.question_type,
      engine: merged.engine,
    };
    if (!intentFromLlm && !model) mode = "basic";
  }

  const merged = mergeIntent(intent, prior);
  // Apply prefilled engine when still unset.
  const engine = merged.engine ?? catalogueEngine;
  const state: AdvisorChatState = {
    goal: merged.goal,
    budgetMax: merged.budgetMax,
    engine,
  };

  const { needs, ask } = needsAsk(state, catalogueEngine);

  // Incomplete — ask next question with a short template (no LLM inventing).
  if (ask || !state.goal || state.budgetMax === null) {
    const bits: string[] = [];
    if (intent.goal) bits.push(goalBit(intent.goal));
    if (state.budgetMax !== null) bits.push(`budget up to ${formatINR(state.budgetMax)}`);
    const summary = bits.length ? `Got it — ${bits.join(", ")}. ` : "";
    return {
      mode: req.forceBasic ? "basic" : mode,
      model: req.forceBasic ? null : model,
      statusLabel: statusLabel(req.forceBasic ? "basic" : mode, model),
      intent,
      state,
      result: null,
      explanation: `${summary}${ask ?? "Tell me a bit more so I can recommend parts."}`,
      explanationSource: "template",
      needs: {
        goal: !state.goal,
        engine: !state.engine,
        budget: state.budgetMax === null,
      },
      ask,
    };
  }

  const result = recommend({
    car: req.car,
    goal: state.goal,
    engineType: state.engine,
    budgetMax: state.budgetMax,
  });

  const ctx = buildExplanationContext(carName(req.car), state.goal, state.budgetMax, result);
  const budgetFacts = computeBudgetFacts(result.recommendations, state.budgetMax);
  const allowed = allowedFactsFromResult(result, [state.budgetMax, budgetFacts.comboMaxTotal]);
  const allNames = UPGRADES.map((u) => u.name);

  let explanation: string;
  let explanationSource: "llm" | "template" = "template";

  const useLlm = mode === "local" && model && !req.forceBasic;
  if (useLlm) {
    try {
      const raw = hooks.explainFn
        ? await hooks.explainFn(ctx)
        : await explainWithLlm(ctx, {
            ...req.ollama,
            model: model!,
            onToken: hooks.onToken,
          });
      const check = postCheckExplanation(raw, allowed, allNames, budgetFacts);
      if (check.ok && raw.trim()) {
        explanation = raw.trim();
        explanationSource = "llm";
      } else {
        explanation = templateExplanation(
          carName(req.car),
          state.goal,
          state.budgetMax,
          result
        );
        // Still emit template via onToken if we had started streaming junk — client replaces.
      }
    } catch {
      mode = "basic";
      explanation = templateExplanation(
        carName(req.car),
        state.goal,
        state.budgetMax,
        result
      );
    }
  } else {
    explanation = templateExplanation(
      carName(req.car),
      state.goal,
      state.budgetMax,
      result
    );
  }

  if (req.forceBasic) mode = "basic";

  return {
    mode,
    model: mode === "local" ? model : null,
    statusLabel: statusLabel(mode, mode === "local" ? model : null),
    intent,
    state,
    result,
    explanation,
    explanationSource,
    needs: { goal: false, engine: false, budget: false },
    ask: null,
  };
}

function goalBit(goal: Goal): string {
  return goal;
}

function statusLabel(mode: AdvisorChatMode, model: string | null): string {
  if (mode === "local" && model) return `Local AI: ${model}`;
  return "Basic mode";
}
