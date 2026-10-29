"use client";

import { useState } from "react";

export type Candidate = {
  make: string;
  model: string;
  year_from: number;
  year_to: number | null;
  score: number;
};

export type Confirmed = { make: string; model: string; year: number | null };

type Step = "confirm" | "alternatives" | "year" | "done";

export default function IdentifyChat({
  candidates,
  onConfirm,
  onManual,
}: {
  candidates: Candidate[];
  onConfirm: (c: Confirmed) => void;
  onManual: () => void;
}) {
  const top = candidates[0];
  const [step, setStep] = useState<Step>("confirm");
  const [picked, setPicked] = useState<Candidate>(top);
  const [log, setLog] = useState<{ from: "ai" | "user"; text: string }[]>([
    {
      from: "ai",
      text:
        top.score >= 0.5
          ? `This looks like a ${top.make} ${top.model} (about ${Math.round(top.score * 100)}% sure). Is that your car?`
          : `I'm not very sure, but my best guess is a ${top.make} ${top.model} (${Math.round(top.score * 100)}%). Is that your car?`,
    },
  ]);

  const thisYear = new Date().getFullYear();

  function say(from: "ai" | "user", text: string) {
    setLog((l) => [...l, { from, text }]);
  }

  function choose(c: Candidate) {
    setPicked(c);
    say("user", `Yes, it's a ${c.make} ${c.model}.`);
    say("ai", "Which year was it made? I can't read the exact year from a photo.");
    setStep("year");
  }

  function pickYear(y: number | null) {
    say("user", y ? String(y) : "Not sure");
    say("ai", `Got it. I've filled in ${picked.make} ${picked.model}${y ? ` ${y}` : ""}. Check the details above, then add the car.`);
    setStep("done");
    onConfirm({ make: picked.make, model: picked.model, year: y });
  }

  const years: number[] = [];
  const last = picked.year_to ?? thisYear;
  for (let y = last; y >= picked.year_from && years.length < 30; y--) years.push(y);

  const chip =
    "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-800 transition-colors hover:border-amber-500 hover:bg-amber-50";

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="space-y-2">
        {log.map((m, i) => (
          <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                m.from === "user" ? "bg-neutral-900 text-white" : "bg-white text-neutral-800 shadow-sm"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {step === "confirm" && (
          <>
            <button type="button" className={chip} onClick={() => choose(top)}>
              Yes, that's it
            </button>
            <button
              type="button"
              className={chip}
              onClick={() => {
                say("user", "No.");
                say("ai", "Is it one of these instead?");
                setStep("alternatives");
              }}
            >
              No
            </button>
          </>
        )}
        {step === "alternatives" && (
          <>
            {candidates.slice(1).map((c) => (
              <button type="button" key={`${c.make}${c.model}`} className={chip} onClick={() => choose(c)}>
                {c.make} {c.model}
              </button>
            ))}
            <button
              type="button"
              className={chip}
              onClick={() => {
                say("user", "None of these.");
                say("ai", "No problem. Type the make and model in the fields above instead.");
                setStep("done");
                onManual();
              }}
            >
              None of these
            </button>
          </>
        )}
        {step === "year" && (
          <>
            <select
              defaultValue=""
              onChange={(e) => e.target.value && pickYear(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-800"
            >
              <option value="" disabled>
                Pick the year
              </option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" className={chip} onClick={() => pickYear(null)}>
              Not sure
            </button>
          </>
        )}
      </div>
    </div>
  );
}
