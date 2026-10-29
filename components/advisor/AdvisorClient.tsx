"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ADVISOR_DISCLAIMER,
  BUDGET_PRESETS,
  COLOUR_CHANGE_NOTE,
  ENGINE_TYPES,
  GOALS,
} from "@/lib/advisor/data";
import {
  buildInstallerLink,
  formatCostRange,
  formatINR,
  prefilledEngine,
  type AdvisorResult,
} from "@/lib/advisor/recommend";
import type { AdvisorChatCar, AdvisorChatState, CarResolution } from "@/lib/advisor/chat";
import type { ChatMessage } from "@/lib/advisor/intent";

type UiMsg = {
  id: string;
  from: "advisor" | "user";
  text: string;
  streaming?: boolean;
};

type MetaPayload = {
  type: "meta";
  mode: "local" | "basic";
  model: string | null;
  statusLabel: string;
  state: AdvisorChatState;
  result: AdvisorResult | null;
  explanationSource: "llm" | "template";
  needs: { goal: boolean; engine: boolean; budget: boolean };
  car?: AdvisorChatCar;
  carResolution?: CarResolution;
  carNoteBanner?: string | null;
  forceBasic?: boolean;
};

export type AdvisorCarContext = {
  id?: string;
  make: string;
  model: string;
  year: number | null;
};

function describeCar(car: AdvisorCarContext | null): string | null {
  if (!car) return null;
  return `${car.year ? `${car.year} ` : ""}${car.make} ${car.model}`;
}

const chip =
  "rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:border-amber-500 hover:bg-amber-50";
const chipActive =
  "rounded-full border border-amber-500 bg-amber-50 px-3 py-1.5 text-xs font-medium text-neutral-900";

const SUGGESTIONS = [
  "More power under 50k",
  "Louder exhaust under 30 thousand",
  "Better brakes for 1 lakh",
  "What about cheaper?",
  "And for the rear?",
];

function openingMessage(car: AdvisorCarContext | null, generalMode: boolean): string {
  if (car) {
    return `Let's plan upgrades for your ${describeCar(car)}. Ask in plain language — e.g. “more power under 50k” — or tap a suggestion. Parts, prices and fitment always come from the rule engine.`;
  }
  if (generalMode) {
    return "Hi! Which car do you drive? Tell me the make and model (e.g. “Hyundai Creta”) and what you want to upgrade — or just ask generally, e.g. “more power under 50k”. Parts, prices and fitment always come from the rule engine.";
  }
  return "Tell me what you want to upgrade — e.g. “more power under 50k”. Parts, prices and fitment always come from the rule engine.";
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AdvisorClient({
  car,
  generalMode = false,
  onChangeCar,
}: {
  car: AdvisorCarContext | null;
  generalMode?: boolean;
  onChangeCar?: () => void;
}) {
  // The car shown in the context bar. Starts from the prop and may be
  // updated when the server identifies a catalogue car from the chat text.
  const [activeCar, setActiveCar] = useState<AdvisorCarContext | null>(car);
  const [carResolution, setCarResolution] = useState<CarResolution>(
    car ? "selected" : "generic"
  );
  const [carNoteBanner, setCarNoteBanner] = useState<string | null>(null);
  const carName = describeCar(activeCar) ?? "car";
  const prefilled = useMemo(
    () => (activeCar ? prefilledEngine(activeCar.make, activeCar.model) : null),
    [activeCar]
  );

  const [statusLabel, setStatusLabel] = useState("Basic mode");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<AdvisorChatState>({
    goal: null,
    budgetMax: null,
    engine: prefilled,
  });
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [budgetLabel, setBudgetLabel] = useState("");
  const [log, setLog] = useState<UiMsg[]>([
    {
      id: uid(),
      from: "advisor",
      text: openingMessage(car, generalMode),
    },
  ]);

  const messagesRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [log, busy]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(
      () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      80
    );
    return () => clearTimeout(t);
  }, [result]);

  function pushHistory(role: "user" | "assistant", content: string) {
    historyRef.current = [...historyRef.current, { role, content }].slice(-6);
  }

  async function sendChat(userText: string) {
    const text = userText.trim();
    if (!text || busy) return;
    setBusy(true);
    setTyped("");
    setResult(null);

    const userMsg: UiMsg = { id: uid(), from: "user", text };
    const assistantId = uid();
    setLog((l) => [
      ...l,
      userMsg,
      { id: assistantId, from: "advisor", text: "", streaming: true },
    ]);
    pushHistory("user", text);

    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyRef.current,
          car: activeCar
            ? { make: activeCar.make, model: activeCar.model, year: activeCar.year }
            : null,
          carResolution: carResolution === "identified" ? "identified" : undefined,
          state,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assembled = "";
      let meta: MetaPayload | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const block of parts) {
          const line = block.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.replace(/^data:\s*/, "");
          let ev: { type: string; t?: string; message?: string } & Partial<MetaPayload>;
          try {
            ev = JSON.parse(json);
          } catch {
            continue;
          }
          if (ev.type === "meta") {
            meta = ev as MetaPayload;
            setStatusLabel(meta.statusLabel || "Basic mode");
            setState(meta.state);
            if (meta.carResolution) {
              setCarResolution(meta.carResolution);
              setCarNoteBanner(meta.carNoteBanner ?? null);
              const metaCar = meta.car;
              if (meta.carResolution === "identified" && metaCar) {
                setActiveCar((prev) =>
                  prev && prev.make === metaCar.make && prev.model === metaCar.model
                    ? prev
                    : { make: metaCar.make, model: metaCar.model, year: metaCar.year }
                );
              }
            }
            if (meta.state.budgetMax !== null) {
              setBudgetLabel(
                meta.state.budgetMax === Number.POSITIVE_INFINITY
                  ? "Open budget"
                  : `Up to ${formatINR(meta.state.budgetMax)}`
              );
            }
            if (meta.result) setResult(meta.result);
          } else if (ev.type === "token" && typeof ev.t === "string") {
            assembled += ev.t;
            const snapshot = assembled;
            setLog((l) =>
              l.map((m) =>
                m.id === assistantId ? { ...m, text: snapshot, streaming: true } : m
              )
            );
          } else if (ev.type === "error") {
            throw new Error(ev.message || "Advisor error");
          }
        }
      }

      const finalText =
        assembled.trim() ||
        "I couldn't reach the local model, so here's the rule-based answer instead. Try again in a moment.";
      setLog((l) =>
        l.map((m) =>
          m.id === assistantId ? { ...m, text: finalText, streaming: false } : m
        )
      );
      pushHistory("assistant", finalText);
      if (meta?.result) setResult(meta.result);
    } catch {
      const fallback =
        "Something went wrong talking to the advisor. You're in Basic mode — try a shorter question like “more power under 50k”.";
      setStatusLabel("Basic mode");
      setLog((l) =>
        l.map((m) =>
          m.id === assistantId ? { ...m, text: fallback, streaming: false } : m
        )
      );
      pushHistory("assistant", fallback);
    } finally {
      setBusy(false);
    }
  }

  function pickGoal(g: (typeof GOALS)[number]) {
    void sendChat(g.label);
  }

  function pickEngine(e: (typeof ENGINE_TYPES)[number]) {
    setState((s) => ({ ...s, engine: e.key }));
    void sendChat(`My engine is ${e.label}`);
  }

  function pickBudget(max: number, label: string) {
    setState((s) => ({ ...s, budgetMax: max }));
    setBudgetLabel(label);
    void sendChat(`Budget: ${label}`);
  }

  function restart() {
    historyRef.current = [];
    setState({ goal: null, budgetMax: null, engine: prefilled });
    setResult(null);
    setBudgetLabel("");
    setTyped("");
    setLog([
      {
        id: uid(),
        from: "advisor",
        text: activeCar
          ? `Starting again for your ${carName}. What do you want to upgrade?`
          : "Starting again. Which car do you drive, and what do you want to upgrade?",
      },
    ]);
  }

  const showEngineChips = state.goal && !state.engine;
  const showBudgetChips = state.goal && state.engine && state.budgetMax === null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            {generalMode && carResolution === "identified" ? "Car identified" : "Car"}
          </p>
          <p
            className={`truncate text-sm font-semibold ${
              activeCar ? "text-neutral-900" : "text-neutral-600"
            }`}
          >
            {describeCar(activeCar) ?? "No car selected"}
          </p>
          {carNoteBanner && carResolution === "generic" ? (
            <p className="mt-1 text-xs font-medium text-amber-800">{carNoteBanner}</p>
          ) : null}
        </div>
        {onChangeCar ? (
          <button
            type="button"
            onClick={onChangeCar}
            className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-amber-500 hover:bg-amber-50"
          >
            Change car
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              statusLabel.startsWith("Local") ? "bg-emerald-500" : "bg-neutral-400"
            }`}
            aria-hidden
          />{" "}
          <span className="ml-1 font-medium text-neutral-700">{statusLabel}</span>
          {statusLabel === "Basic mode" ? (
            <span className="text-neutral-500"> — rule engine only (Ollama offline, slow, or Detailed edit running)</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div
          ref={messagesRef}
          data-lenis-prevent
          className="min-h-0 max-h-[42dvh] space-y-2 overflow-y-auto overscroll-contain pr-1"
        >
          {log.map((m) => (
            <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.from === "user"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-50 text-neutral-800 shadow-sm ring-1 ring-neutral-200/60"
                }`}
              >
                {m.text}
                {m.streaming ? (
                  <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-amber-500 align-middle" />
                ) : null}
              </p>
            </div>
          ))}
          {busy && log[log.length - 1]?.from === "user" ? (
            <div className="flex justify-start">
              <p className="rounded-2xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-500 ring-1 ring-neutral-200/60">
                Thinking…
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!state.goal &&
            GOALS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={chip}
                disabled={busy}
                onClick={() => pickGoal(g)}
              >
                {g.label}
              </button>
            ))}

          {showEngineChips &&
            ENGINE_TYPES.map((e) => (
              <button
                key={e.key}
                type="button"
                className={prefilled === e.key ? chipActive : chip}
                disabled={busy}
                onClick={() => pickEngine(e)}
              >
                {e.label}
                {prefilled === e.key ? " · your car (catalogue)" : ""}
              </button>
            ))}

          {showBudgetChips && (
            <>
              {BUDGET_PRESETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={chip}
                  disabled={busy}
                  onClick={() => pickBudget(b.max, b.label)}
                >
                  {b.label}
                </button>
              ))}
            </>
          )}

          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={chip}
              disabled={busy}
              onClick={() => void sendChat(s)}
            >
              {s}
            </button>
          ))}

          {result && (
            <button
              type="button"
              onClick={restart}
              disabled={busy}
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500"
            >
              Start again
            </button>
          )}
        </div>
      </div>

      {result && state.goal && state.budgetMax !== null && (
        <div ref={resultsRef} className="mt-6 scroll-mt-4">
          <h2 className="font-display text-lg font-semibold tracking-tight text-neutral-900">
            Recommendations{budgetLabel ? ` for ${budgetLabel.toLowerCase()}` : ""}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {GOALS.find((g) => g.key === state.goal)?.label} ·{" "}
            {ENGINE_TYPES.find((e) => e.key === result.engineType)?.label}
            {result.knownCar
              ? ` · curated entry for the ${result.knownCar.make} ${result.knownCar.model}`
              : " · generic fallback for this body/engine type"}
          </p>
          {result.carNote && (
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              {result.carNote}
            </p>
          )}

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

      <form
        className="sticky bottom-3 z-20 mt-4 flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
        onSubmit={(ev) => {
          ev.preventDefault();
          void sendChat(typed);
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Ask anything, e.g. 'I want more horsepower under 50k'"
          aria-label="Ask the upgrade advisor"
          disabled={busy}
          className="min-w-0 flex-1 rounded-full border border-neutral-300 px-3.5 py-2 text-sm text-neutral-800 outline-none focus:border-amber-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!typed.trim() || busy}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
