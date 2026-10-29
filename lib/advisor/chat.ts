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
import {
  matchCatalogueFromText,
  prefilledEngine,
  recommend,
  type AdvisorResult,
  formatINR,
} from "./recommend";

export type AdvisorChatMode = "local" | "basic";

export type AdvisorChatState = {
  goal: Goal | null;
  budgetMax: number | null;
  engine: EngineType | null;
};

export type AdvisorChatCar = { make: string; model: string; year: number | null };

/** How the car used for this turn was determined. */
export type CarResolution = "selected" | "identified" | "generic";

export const GENERIC_CAR: AdvisorChatCar = { make: "General", model: "guidance", year: null };
export const GENERIC_CAR_BANNER = "General guidance, not specific to your car";

export function isGenericCar(car: { make?: string | null; model?: string | null } | null | undefined) {
  if (!car) return true;
  const make = car.make?.trim().toLowerCase() ?? "";
  const model = car.model?.trim().toLowerCase() ?? "";
  if (!make || !model) return true;
  return make === GENERIC_CAR.make.toLowerCase() && model === GENERIC_CAR.model.toLowerCase();
}

export type AdvisorChatRequest = {
  messages: ChatMessage[];
  /** Optional: omit (or null) for general chat — the car is then identified from text or generic. */
  car?: AdvisorChatCar | null;
  /** Echo of a previous "identified" resolution so the UI banner stays consistent. */
  carResolution?: CarResolution;
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
  /** The car actually used for this turn (selected, identified from text, or generic). */
  car: AdvisorChatCar;
  carResolution: CarResolution;
  /** Set for generic guidance: "General guidance, not specific to your car". */
  carNoteBanner: string | null;
};

function carName(car: AdvisorChatCar): string {
  if (isGenericCar(car)) return "car";
  return `${car.year ? `${car.year} ` : ""}${car.make} ${car.model}`;
}

function resolveCar(
  req: AdvisorChatRequest,
  history: ChatMessage[],
  userText: string,
  intentCar: string | null | undefined
): { car: AdvisorChatCar; carResolution: CarResolution; carNoteBanner: string | null } {
  if (req.car && !isGenericCar(req.car)) {
    return {
      car: {
        make: req.car.make.trim(),
        model: req.car.model.trim(),
        year: req.car.year ?? null,
      },
      carResolution: req.carResolution === "identified" ? "identified" : "selected",
      carNoteBanner: null,
    };
  }
  const fromText =
    matchCatalogueFromText(userText) ??
    (intentCar ? matchCatalogueFromText(intentCar) : null) ??
    matchCatalogueFromText(
      history
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" ")
    );
  if (fromText) {
    return {
      car: { make: fromText.make, model: fromText.model, year: null },
      carResolution: "identified",
      carNoteBanner: null,
    };
  }
  return { car: { ...GENERIC_CAR }, carResolution: "generic", carNoteBanner: GENERIC_CAR_BANNER };
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

  const requestCar: AdvisorChatCar = req.car ?? GENERIC_CAR;

  let mode: AdvisorChatMode = "basic";
  let model: string | null = null;
  let intent: AdvisorIntent | null = null;
  let intentFromLlm = false;

  if (!req.forceBasic) {
    const probe = await probeOllama(req.ollama);
    if (probe.ok && probe.model) {
      model = probe.model;
      if (hooks.intentFn) {
        intent = await hooks.intentFn(history, userText, isGenericCar(requestCar) ? "unknown car" : carName(requestCar));
      } else {
        intent = await extractIntentWithLlm(history, userText, isGenericCar(requestCar) ? "unknown car" : carName(requestCar), {
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
      car: isGenericCar(requestCar) ? null : carName(requestCar),
      parts: [],
      style: null,
      question_type: merged.question_type,
      engine: merged.engine,
    };
    if (!intentFromLlm && !model) mode = "basic";
  }

  const resolved = resolveCar(req, history, userText, intent.car);
  const rcar = resolved.car;
  const catalogueEngine = prefilledEngine(rcar.make, rcar.model);
  const carFields = {
    car: rcar,
    carResolution: resolved.carResolution,
    carNoteBanner: resolved.carNoteBanner,
  };

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
      ...carFields,
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
    car: rcar,
    goal: state.goal,
    engineType: state.engine,
    budgetMax: state.budgetMax,
  });

  const ctx = buildExplanationContext(carName(rcar), state.goal, state.budgetMax, result);
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
          carName(rcar),
          state.goal,
          state.budgetMax,
          result
        );
        // Still emit template via onToken if we had started streaming junk — client replaces.
      }
    } catch {
      mode = "basic";
      explanation = templateExplanation(
        carName(rcar),
        state.goal,
        state.budgetMax,
        result
      );
    }
  } else {
    explanation = templateExplanation(
      carName(rcar),
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
    ...carFields,
  };
}

function goalBit(goal: Goal): string {
  return goal;
}

function statusLabel(mode: AdvisorChatMode, model: string | null): string {
  if (mode === "local" && model) return `Local AI: ${model}`;
  return "Basic mode";
}
