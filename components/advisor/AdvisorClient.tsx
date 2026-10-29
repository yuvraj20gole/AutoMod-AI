"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADVISOR_DISCLAIMER,
  BUDGET_PRESETS,
  COLOUR_CHANGE_NOTE,
  ENGINE_TYPES,
  GOALS,
  type EngineType,
  type Goal,
} from "@/lib/advisor/data";
import { parseRequest } from "@/lib/advisor/parse";
import {
  buildInstallerLink,
  findCatalogueCar,
  formatCostRange,
  formatINR,
  prefilledEngine,
  recommend,
} from "@/lib/advisor/recommend";

type Msg = { from: "advisor" | "user"; text: string };
type Step = "goal" | "engine" | "budget" | "results";

const chip =
  "rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:border-amber-500 hover:bg-amber-50";
const chipActive =
  "rounded-full border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-medium text-neutral-900";

export default function AdvisorClient({
  make,
  model,
  year,
}: {
  make: string;
  model: string;
  year: number | null;
}) {
  const carName = `${year ? `${year} ` : ""}${make} ${model}`;
  const catalogue = useMemo(() => findCatalogueCar(make, model), [make, model]);
  const prefilled = useMemo(() => prefilledEngine(make, model), [make, model]);

  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [engine, setEngine] = useState<EngineType | null>(null);
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [budgetLabel, setBudgetLabel] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [typed, setTyped] = useState("");
  const [log, setLog] = useState<Msg[]>([
    {
      from: "advisor",
      text: `Let's plan upgrades for your ${carName}. I'll ask one question at a time and only suggest parts whose full cost fits your budget. What do you want to upgrade?`,
    },
  ]);

  function say(from: Msg["from"], text: string) {
    setLog((l) => [...l, { from, text }]);
  }

  function pickGoal(g: (typeof GOALS)[number]) {
    setGoal(g.key);
    say("user", g.label);
    // Free text may have answered engine/budget already — skip those.
    if (engine && budgetMax !== null) {
      say(
        "advisor",
        "Here are the upgrades that fit — best value first. Costs are broad curated ranges (parts + typical fitting), not live prices, and each card says who should fit it and where to search for it."
      );
      setStep("results");
      return;
    }
    if (engine) {
      say("advisor", "What is your budget? I'll only show options whose whole cost range fits inside it.");
      setStep("budget");
      return;
    }
    if (catalogue && prefilled) {
      say(
        "advisor",
        `Got it. From our catalogue, the ${catalogue.make} ${catalogue.model} usually has a ${ENGINE_TYPES.find((e) => e.key === prefilled)?.label.toLowerCase()} engine — I've pre-filled that. ${catalogue.engineNote} Is that right, or is yours different?`
      );
    } else {
      say(
        "advisor",
        `Got it. We don't have the ${make} ${model} in our catalogue yet, so I need this from you: what engine does it have?`
      );
    }
    setStep("engine");
  }

  function pickEngine(e: (typeof ENGINE_TYPES)[number]) {
    setEngine(e.key);
    say("user", e.label);
    // Free text may have answered the budget already — skip asking again.
    if (budgetMax !== null) {
      say(
        "advisor",
        "Here are the upgrades that fit — best value first. Costs are broad curated ranges (parts + typical fitting), not live prices, and each card says who should fit it and where to search for it."
      );
      setStep("results");
      return;
    }
    say("advisor", "What is your budget? I'll only show options whose whole cost range fits inside it.");
    setStep("budget");
  }

  function pickBudget(max: number, label: string) {
    setBudgetMax(max);
    setBudgetLabel(label);
    say("user", label);
    say(
      "advisor",
      "Here are the upgrades that fit — best value first. Costs are broad curated ranges (parts + typical fitting), not live prices, and each card says who should fit it and where to search for it."
    );
    setStep("results");
  }

  /**
   * Free-text path. The sentence is shown as the user's bubble, the
   * parser fills in whatever it answers, and we then ask only for the
   * first thing still missing — using the same steps/buttons as the
   * button flow. Nothing understood → friendly list of known goals.
   */
  function handleTyped() {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    say("user", text);
    const parsed = parseRequest(text);

    if (!parsed.goal && parsed.budgetMax === undefined && !parsed.engine) {
      say(
        "advisor",
        "I didn't quite catch that — no problem. I can help with: More power, Exhaust, Suspension and handling, Brakes, Wheels and tyres, or Looks and lighting. Pick one below, or type something like 'more power under 50k'."
      );
      setStep("goal");
      return;
    }

    const g = parsed.goal ?? goal;
    const e = parsed.engine ?? engine;
    const b = parsed.budgetMax ?? budgetMax;
    if (parsed.goal) setGoal(parsed.goal);
    if (parsed.engine) setEngine(parsed.engine);
    if (parsed.budgetMax !== undefined) {
      setBudgetMax(parsed.budgetMax);
      setBudgetLabel(`Up to ${formatINR(parsed.budgetMax)}`);
    }

    const bits: string[] = [];
    if (parsed.goal) bits.push(GOALS.find((x) => x.key === parsed.goal)?.label ?? parsed.goal);
    if (parsed.engine)
      bits.push(ENGINE_TYPES.find((x) => x.key === parsed.engine)?.label ?? parsed.engine);
    if (parsed.budgetMax !== undefined) bits.push(`budget up to ${formatINR(parsed.budgetMax)}`);
    const summary = bits.length > 0 ? `Got it — ${bits.join(", ")}.` : "Got it.";

    if (!g) {
      say("advisor", `${summary} What do you want to upgrade?`);
      setStep("goal");
    } else if (!e) {
      if (catalogue && prefilled) {
        say(
          "advisor",
          `${summary} From our catalogue, the ${catalogue.make} ${catalogue.model} usually has a ${ENGINE_TYPES.find((x) => x.key === prefilled)?.label.toLowerCase()} engine — I've pre-filled that. ${catalogue.engineNote} Is that right, or is yours different?`
        );
      } else {
        say(
          "advisor",
          `${summary} We don't have the ${make} ${model} in our catalogue yet, so I need this from you: what engine does it have?`
        );
      }
      setStep("engine");
    } else if (b === null || b === undefined) {
      say(
        "advisor",
        `${summary} What is your budget? I'll only show options whose whole cost range fits inside it.`
      );
      setStep("budget");
    } else {
      say(
        "advisor",
        `${summary} Here are the upgrades that fit — best value first. Costs are broad curated ranges (parts + typical fitting), not live prices, and each card says who should fit it and where to search for it.`
      );
      setStep("results");
    }
  }

  function restart() {
    setStep("goal");
    setGoal(null);
    setEngine(null);
    setBudgetMax(null);
    setBudgetLabel("");
    setCustom("");
    setTyped("");
    setLog([
      {
        from: "advisor",
        text: `Starting again for your ${carName}. What do you want to upgrade?`,
      },
    ]);
  }

  const result = useMemo(() => {
    if (!goal || budgetMax === null) return null;
    return recommend({
      car: { make, model, year },
      goal,
      engineType: engine,
      budgetMax,
    });
  }, [goal, engine, budgetMax, make, model, year]);

  const customAmount = Number(custom.replace(/[^0-9]/g, ""));
  const customValid = Number.isFinite(customAmount) && customAmount >= 500;

  const messagesRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Keep the newest chat message in view inside the message scroller.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [log, step]);

  // When recommendations appear, bring the start of the block into view.
  useEffect(() => {
    if (step !== "results") return;
    const t = setTimeout(
      () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
    return () => clearTimeout(t);
  }, [step, result]);

  return (
    <div>
      {/* Chat */}
      <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div
          ref={messagesRef}
          data-lenis-prevent
          className="min-h-0 max-h-[42dvh] space-y-2 overflow-y-auto overscroll-contain pr-1"
        >
          {log.map((m, i) => (
            <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.from === "user"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-50 text-neutral-800 shadow-sm ring-1 ring-neutral-200/60"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {step === "goal" &&
            GOALS.map((g) => (
              <button key={g.key} type="button" className={chip} onClick={() => pickGoal(g)}>
                {g.label}
              </button>
            ))}

          {step === "engine" &&
            ENGINE_TYPES.map((e) => (
              <button
                key={e.key}
                type="button"
                className={prefilled === e.key ? chipActive : chip}
                onClick={() => pickEngine(e)}
              >
                {e.label}
                {prefilled === e.key ? " · your car (catalogue)" : ""}
              </button>
            ))}

          {step === "budget" && (
            <>
              {BUDGET_PRESETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={chip}
                  onClick={() => pickBudget(b.max, b.label)}
                >
                  {b.label}
                </button>
              ))}
              <span className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">or custom ₹</span>
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  inputMode="numeric"
                  placeholder="50,000"
                  className="w-28 rounded-full border border-neutral-300 px-3 py-1.5 text-xs text-neutral-800 outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={!customValid}
                  className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
                  onClick={() => pickBudget(customAmount, `Custom: up to ${formatINR(customAmount)}`)}
                >
                  Use amount
                </button>
              </span>
            </>
          )}

          {step === "results" && (
            <button
              type="button"
              onClick={restart}
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500"
            >
              Start again
            </button>
          )}
        </div>

      </div>

      {/* Results */}
      {step === "results" && result && (
        <div ref={resultsRef} className="mt-6 scroll-mt-4">
          <h2 className="font-display text-lg font-semibold tracking-tight text-neutral-900">
            Recommendations for {budgetLabel.toLowerCase()}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {GOALS.find((g) => g.key === goal)?.label} ·{" "}
            {ENGINE_TYPES.find((e) => e.key === result.engineType)?.label}
            {result.knownCar
              ? ` · curated entry for the ${result.knownCar.make} ${result.knownCar.model}`
              : " · generic fallback for this body/engine type"}
          </p>

          {result.warnings.map((w) => (
            <p
              key={w}
              className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {w}
            </p>
          ))}

          {result.recommendations.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-sm text-neutral-700">
                Nothing in our curated list fits that budget for this goal without cutting corners
                we won&apos;t recommend. Try a higher budget, or start again with a different goal —
                brakes and tyres usually give the most for the least money.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {result.recommendations.map((r) => (
                <article key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-900">{r.name}</h3>
                    <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
                      {formatCostRange(r.costMin, r.costMax)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Approximate cost (parts + typical fitting). Best-value rank is based on
                    benefit for the money, not price alone.
                  </p>

                  <p className="mt-3 text-sm leading-relaxed text-neutral-700">{r.benefit}</p>

                  <div className="mt-4 rounded-xl bg-neutral-50 p-3.5 ring-1 ring-neutral-200/60">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-900">
                      Can this build take it?
                    </h4>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-neutral-700">
                      {r.buildChecks.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-900">
                      Risks
                    </h4>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-neutral-700">
                      {r.risks.map((risk) => (
                        <li key={risk}>{risk}</li>
                      ))}
                    </ul>
                  </div>

                  <p className="mt-3 text-sm text-neutral-700">
                    <span className="font-medium text-neutral-900">Who should fit it: </span>
                    {r.fitmentLabel}
                    {r.shopMustFit ? " A mechanic or shop must fit this." : ""}
                  </p>

                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-900">
                      Where to buy or fit
                    </h4>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Search links only — we don&apos;t list live prices or shop names, so check
                      current prices and reviews there.
                    </p>
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      <a href={r.links.amazon} target="_blank" rel="noreferrer" className={chip}>
                        Search Amazon.in
                      </a>
                      <a href={r.links.flipkart} target="_blank" rel="noreferrer" className={chip}>
                        Search Flipkart
                      </a>
                      <a href={r.links.mapsFitting} target="_blank" rel="noreferrer" className={chip}>
                        Fitting shops near me (Google Maps)
                      </a>
                      <a href={r.links.mapsMumbai} target="_blank" rel="noreferrer" className={chip}>
                        Modification shops in Mumbai (Google Maps)
                      </a>
                      <span className="flex flex-col gap-1">
                        <a
                          href={buildInstallerLink(r.installer.mapsQuery)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-amber-500 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-neutral-900 transition-colors hover:bg-amber-100"
                        >
                          Find an installer
                        </a>
                        <span className="text-center text-[11px] text-neutral-500">
                          {r.installer.trade}
                        </span>
                      </span>
                    </div>
                    {r.installer.note && (
                      <p className="mt-2 text-xs text-neutral-500">{r.installer.note}</p>
                    )}
                    {r.colourChange && (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        {COLOUR_CHANGE_NOTE}
                      </p>
                    )}
                    {r.goals.some((g) =>
                      ["power", "exhaust", "suspension", "brakes"].includes(g)
                    ) && (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        Use a reputable workshop, ask for a written quote, and check that the
                        work is road-legal and that your insurer is informed.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            {ADVISOR_DISCLAIMER}
          </p>
          <p className="mt-3 text-sm text-neutral-600">
            Prices and availability vary by city. Compare at least two quotes.
          </p>
        </div>
      )}

      {/* Free-text input — sticky so it stays reachable while scrolling
          through the recommendations. */}
      <form
        className="sticky bottom-3 z-20 mt-4 flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
        onSubmit={(ev) => {
          ev.preventDefault();
          handleTyped();
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type what you want, e.g. 'I want more horsepower under 50k'"
          aria-label="Type what you want"
          className="min-w-0 flex-1 rounded-full border border-neutral-300 px-3.5 py-2 text-sm text-neutral-800 outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={!typed.trim()}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
