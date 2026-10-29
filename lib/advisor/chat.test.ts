import { describe, expect, it, vi } from "vitest";
import {
  parseIntentJson,
  mergeIntent,
  intentFromRules,
  trimHistory,
} from "./intent";
import {
  postCheckExplanation,
  allowedFactsFromResult,
  computeBudgetFacts,
  findFalseBudgetClaims,
  templateExplanation,
} from "./explain";
import { runAdvisorChat } from "./chat";
import { recommend } from "./recommend";
import { UPGRADES } from "./data";

describe("intent JSON validation", () => {
  it("accepts valid intent JSON", () => {
    const raw = JSON.stringify({
      goal: "power",
      budget: 50000,
      car: "Toyota Corolla",
      parts: ["intake"],
      style: null,
      question_type: "recommend",
      engine: "petrol_na",
    });
    expect(parseIntentJson(raw)).toMatchObject({
      goal: "power",
      budget: 50000,
      question_type: "recommend",
    });
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"goal":"brakes","budget":25000,"parts":[],"question_type":"recommend"}\n```';
    expect(parseIntentJson(raw)?.goal).toBe("brakes");
  });

  it("rejects invalid goal", () => {
    expect(parseIntentJson('{"goal":"nitrous","budget":10000,"parts":[]}')).toBeNull();
  });
});

describe("multi-turn follow-up resolution", () => {
  it("cheaper follow-up lowers prior budget", () => {
    const merged = mergeIntent(
      {
        goal: null,
        budget: null,
        parts: [],
        question_type: "cheaper",
      },
      { goal: "power", budgetMax: 100_000, engine: "petrol_na" }
    );
    expect(merged.goal).toBe("power");
    expect(merged.budgetMax).toBe(60_000);
  });

  it("follow-up keeps prior goal when LLM only updates parts/style", () => {
    const merged = mergeIntent(
      {
        goal: null,
        budget: null,
        parts: ["rear muffler"],
        style: "and for the rear",
        question_type: "follow_up",
      },
      { goal: "exhaust", budgetMax: 40_000, engine: null }
    );
    expect(merged.goal).toBe("exhaust");
    expect(merged.budgetMax).toBe(40_000);
  });

  it("trimHistory keeps last 6 messages", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`,
    }));
    expect(trimHistory(msgs, 6)).toHaveLength(6);
    expect(trimHistory(msgs, 6)[0].content).toBe("m4");
  });

  it("rule fallback resolves cheaper phrasing", () => {
    const r = intentFromRules("what about cheaper?", {
      goal: "brakes",
      budgetMax: 50_000,
      engine: "petrol_na",
    });
    expect(r.question_type).toBe("cheaper");
    expect(r.budgetMax).toBe(30_000);
  });
});

describe("post-check rejects invented prices and parts", () => {
  const result = recommend({
    car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
    goal: "power",
    engineType: "petrol_na",
    budgetMax: 50_000,
    currentYear: 2026,
  });
  const allowed = allowedFactsFromResult(result, [50_000]);
  const allNames = UPGRADES.map((u) => u.name);

  it("accepts a template explanation built from the result", () => {
    const text = templateExplanation(
      "2018 Toyota Corolla Altis",
      "power",
      50_000,
      result
    );
    const check = postCheckExplanation(text, allowed, allNames);
    expect(check).toEqual({ ok: true });
  });

  it("rejects an invented price from a mock LLM", () => {
    const fake = `I recommend a remap for ₹99,999 which is a special deal.`;
    const check = postCheckExplanation(fake, allowed, allNames);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/invented price/);
  });

  it("rejects an invented known part name not in this result", () => {
    // Pick a wheels part name that won't appear in a power recommend under 50k.
    const wheelsOnly = UPGRADES.find((u) => u.goals.includes("wheels") && u.name.length >= 12);
    expect(wheelsOnly).toBeTruthy();
    const fake = `Also fit a ${wheelsOnly!.name} while you are at it.`;
    const check = postCheckExplanation(fake, allowed, allNames);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/invented part/);
  });

  it("runAdvisorChat discards invented LLM explanation", async () => {
    const out = await runAdvisorChat(
      {
        messages: [{ role: "user", content: "more power under 50k" }],
        car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
        state: { engine: "petrol_na" },
        forceBasic: false,
        ollama: {
          // Probe will fail → but we inject intent + explain hooks
          fetchFn: async () =>
            new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b-instruct" }] }), {
              status: 200,
            }),
        },
      },
      {
        intentFn: async () => ({
          goal: "power",
          budget: 50_000,
          car: null,
          parts: [],
          style: null,
          question_type: "recommend",
          engine: "petrol_na",
        }),
        explainFn: async () =>
          "Buy the Magical Turbo Kit for ₹2,50,000 from FakeSpeed Motors.",
      }
    );
    expect(out.explanationSource).toBe("template");
    expect(out.explanation).not.toMatch(/2,50,000|FakeSpeed|Magical Turbo/i);
    expect(out.result?.recommendations.length).toBeGreaterThan(0);
  });
});

describe("budget-fit post-check (both directions)", () => {
  const result = recommend({
    car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
    goal: "power",
    engineType: "petrol_na",
    budgetMax: 50_000,
    currentYear: 2026,
  });
  const facts = computeBudgetFacts(result.recommendations, 50_000);
  const allowed = allowedFactsFromResult(result, [50_000, facts.comboMaxTotal]);
  const allNames = UPGRADES.map((u) => u.name);

  it("every recommended item under 50k fits alone; combo is a greedy subset", () => {
    expect(facts.items.length).toBeGreaterThan(0);
    expect(facts.items.every((i) => i.fitsAlone && i.maxFits)).toBe(true);
    expect(facts.comboWithinBudget.length).toBeGreaterThan(0);
    expect(facts.comboMaxTotal).toBeLessThanOrEqual(50_000);
  });

  it("rejects 'does not fit / not within budget' when the item's max is under budget", () => {
    const ecu = result.recommendations.find((r) => r.id === "na-ecu-tune");
    expect(ecu).toBeTruthy();
    const fake = `The ${ecu!.name}, cold-air kit and throttle response controller are not fitting within your ₹50,000 budget.`;
    expect(findFalseBudgetClaims(fake, facts)).toMatch(/false over-budget/);
    const check = postCheckExplanation(fake, allowed, allNames, facts);
    expect(check.ok).toBe(false);
  });

  it("rejects a claim that an item fits when its min price is above the budget", () => {
    const synthetic = {
      budgetMax: 10_000,
      items: [
        {
          name: "Stage 1 ECU remap (turbo petrol)",
          costMin: 25_000,
          costMax: 45_000,
          fitsAlone: false,
          minFits: false,
          maxFits: false,
        },
      ],
      comboWithinBudget: [] as string[],
      comboMaxTotal: 0,
    };
    const fake =
      "The Stage 1 ECU remap (turbo petrol) fits within your budget and is a great pick.";
    expect(findFalseBudgetClaims(fake, synthetic)).toMatch(/false under-budget/);
  });

  it("runAdvisorChat discards a misleading over-budget LLM explanation", async () => {
    const ecu = result.recommendations.find((r) => r.id === "na-ecu-tune")!;
    const out = await runAdvisorChat(
      {
        messages: [{ role: "user", content: "more power under 50k" }],
        car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
        state: { engine: "petrol_na" },
        ollama: {
          fetchFn: async () =>
            new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b-instruct" }] }), {
              status: 200,
            }),
        },
      },
      {
        intentFn: async () => ({
          goal: "power",
          budget: 50_000,
          car: null,
          parts: [],
          style: null,
          question_type: "recommend",
          engine: "petrol_na",
        }),
        explainFn: async () =>
          `The ${ecu.name} and Cold-air / performance intake kit are not within your ₹50,000 budget.`,
      }
    );
    expect(out.explanationSource).toBe("template");
    expect(out.explanation).toMatch(/each listed option fits that ceiling on its own/i);
    expect(out.explanation).not.toMatch(/not within your ₹50,000 budget/i);
  });
});

describe("Ollama down / Basic mode", () => {
  it("falls back to Basic mode when Ollama is unreachable", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "more power under 50k on my petrol NA" }],
      car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
      ollama: {
        fetchFn: async () => {
          throw new Error("ECONNREFUSED");
        },
      },
    });
    expect(out.mode).toBe("basic");
    expect(out.statusLabel).toBe("Basic mode");
    expect(out.result?.recommendations.length).toBeGreaterThan(0);
    expect(out.explanationSource).toBe("template");
  });

  it("forceBasic skips LLM even if Ollama would be up", async () => {
    const probe = vi.fn(async () => {
      throw new Error("should not probe");
    });
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "brakes under 30k" }],
      car: { make: "Hyundai", model: "Verna", year: 2020 },
      forceBasic: true,
      state: { engine: "petrol_na" },
      ollama: { fetchFn: probe as unknown as typeof fetch },
    });
    expect(out.mode).toBe("basic");
    expect(out.statusLabel).toBe("Basic mode");
    // forceBasic returns before probe — fetchFn unused is fine
    expect(out.result).not.toBeNull();
  });

  it("multi-turn cheaper with mocked intent", async () => {
    const out = await runAdvisorChat(
      {
        messages: [
          { role: "user", content: "more power under 1 lakh" },
          { role: "assistant", content: "Here are some options…" },
          { role: "user", content: "what about cheaper?" },
        ],
        car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
        state: { goal: "power", budgetMax: 100_000, engine: "petrol_na" },
        ollama: {
          fetchFn: async () =>
            new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b-instruct" }] }), {
              status: 200,
            }),
        },
      },
      {
        intentFn: async () => ({
          goal: null,
          budget: null,
          car: null,
          parts: [],
          style: null,
          question_type: "cheaper",
          engine: null,
        }),
        explainFn: async () => templateExplanation(
          "2018 Toyota Corolla Altis",
          "power",
          60_000,
          recommend({
            car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
            goal: "power",
            engineType: "petrol_na",
            budgetMax: 60_000,
            currentYear: 2026,
          })
        ),
      }
    );
    expect(out.state.budgetMax).toBe(60_000);
    expect(out.state.goal).toBe("power");
    expect(out.result).not.toBeNull();
  });
});
