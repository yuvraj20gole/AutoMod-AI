import { parseIntentJson, type AdvisorIntent, type ChatMessage } from "./intent";

export const OLLAMA_TIMEOUT_MS = 20_000;
export const OLLAMA_KEEP_ALIVE = "60s";

export type OllamaChatOptions = {
  baseUrl?: string;
  model?: string;
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  keepAlive?: string | number;
};

export type OllamaStatus = {
  ok: boolean;
  model: string | null;
  models: string[];
  reason?: string;
};

function envUrl(): string {
  return (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

/**
 * Whether we should probe Ollama at all.
 * On Vercel without OLLAMA_URL, localhost is never reachable — skip the probe
 * so Advisor falls straight to Basic with no multi-second hang or error toast.
 */
export function shouldProbeOllama(opts: OllamaChatOptions = {}): boolean {
  if (opts.baseUrl?.trim() || opts.fetchFn) return true;
  if (process.env.OLLAMA_URL?.trim()) return true;
  if (process.env.VERCEL) return false;
  return true;
}

function preferredModel(available: string[]): string | null {
  const env = process.env.OLLAMA_MODEL?.trim();
  if (env) return env;
  const prefer = [
    "qwen2.5:3b-instruct",
    "llama3.2:3b",
    "phi:latest",
    "qwen2.5:3b",
    "llama3.2:latest",
  ];
  for (const p of prefer) {
    if (available.includes(p)) return p;
  }
  // Any ~3B instruct-ish tag
  const threeB = available.find((m) => /3b/i.test(m));
  return threeB ?? available[0] ?? null;
}

/** List local models; never throws. */
export async function probeOllama(opts: OllamaChatOptions = {}): Promise<OllamaStatus> {
  if (!shouldProbeOllama(opts)) {
    return {
      ok: false,
      model: null,
      models: [],
      reason: "Ollama not configured on this host",
    };
  }
  const baseUrl = opts.baseUrl ?? envUrl();
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? OLLAMA_TIMEOUT_MS;
  try {
    const res = await fetchFn(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)),
    });
    if (!res.ok) {
      return { ok: false, model: null, models: [], reason: `Ollama HTTP ${res.status}` };
    }
    const body = (await res.json()) as { models?: { name: string }[] };
    const models = (body.models ?? []).map((m) => m.name);
    if (models.length === 0) {
      return {
        ok: false,
        model: null,
        models: [],
        reason: "No models installed — run: ollama pull qwen2.5:3b-instruct",
      };
    }
    const model = preferredModel(models);
    return { ok: Boolean(model), model, models };
  } catch (err) {
    return {
      ok: false,
      model: null,
      models: [],
      reason: err instanceof Error ? err.message : "Ollama unreachable",
    };
  }
}

async function chatOnce(
  messages: { role: string; content: string }[],
  opts: OllamaChatOptions & { model: string; stream?: boolean }
): Promise<string> {
  const baseUrl = opts.baseUrl ?? envUrl();
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? OLLAMA_TIMEOUT_MS;
  const keepAlive = opts.keepAlive ?? OLLAMA_KEEP_ALIVE;

  const res = await fetchFn(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: opts.model,
      messages,
      stream: false,
      keep_alive: keepAlive,
      options: { temperature: 0.2, num_predict: 256 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama chat HTTP ${res.status}`);
  }
  const body = (await res.json()) as { message?: { content?: string } };
  return body.message?.content?.trim() ?? "";
}

/** Stream tokens via callback; returns full text. */
export async function streamChat(
  messages: { role: string; content: string }[],
  opts: OllamaChatOptions & { model: string; onToken?: (t: string) => void }
): Promise<string> {
  const baseUrl = opts.baseUrl ?? envUrl();
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? OLLAMA_TIMEOUT_MS;
  const keepAlive = opts.keepAlive ?? OLLAMA_KEEP_ALIVE;

  const res = await fetchFn(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: opts.model,
      messages,
      stream: true,
      keep_alive: keepAlive,
      options: { temperature: 0.35, num_predict: 220 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama stream HTTP ${res.status}`);
  if (!res.body) throw new Error("Ollama stream had no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        const piece = row.message?.content ?? "";
        if (piece) {
          full += piece;
          opts.onToken?.(piece);
        }
      } catch {
        // skip bad chunk
      }
    }
  }
  return full.trim();
}

const INTENT_SYSTEM = `You extract car-upgrade intent for AutoMod AI.
Reply with ONLY a JSON object (no markdown) matching:
{"goal":"power"|"exhaust"|"suspension"|"brakes"|"wheels"|"looks"|null,
 "budget": number_in_INR_or_string_or_null,
 "car": string_or_null,
 "parts": string[],
 "style": string_or_null,
 "question_type":"recommend"|"cheaper"|"follow_up"|"clarify"|"other"|"off_topic_car_info",
 "engine":"petrol_na"|"petrol_turbo"|"diesel"|null}
Rules:
- goal must be one of those six or null.
- budget is a spending ceiling in Indian rupees when the user gives one (e.g. 50000, "50k", "1 lakh").
- question_type=cheaper when they ask for cheaper / lower budget options.
- question_type=off_topic_car_info when they ask about the car's own stock engine, power, mileage, trim, or track suitability — we do not have that data.
- question_type=other for unrelated topics (weather, news, etc.).
- Follow-ups like "and for the rear?" or "what about brakes?" update goal/parts; keep prior budget unless they change it.
- Never invent shops, brands, prices, or engine/spec facts. JSON only.`;

export async function extractIntentWithLlm(
  history: ChatMessage[],
  userText: string,
  carContext: string,
  opts: OllamaChatOptions & { model: string }
): Promise<AdvisorIntent | null> {
  const recent = history.slice(-6);
  const messages = [
    { role: "system", content: INTENT_SYSTEM },
    {
      role: "user",
      content: `Car context: ${carContext}\nRecent chat:\n${recent
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")}\n\nLatest user message: ${userText}\n\nReturn JSON only.`,
    },
  ];

  try {
    const first = await chatOnce(messages, opts);
    const parsed = parseIntentJson(first);
    if (parsed) return parsed;
    // One retry
    const retry = await chatOnce(
      [
        ...messages,
        { role: "assistant", content: first },
        {
          role: "user",
          content: "That was not valid JSON for the schema. Reply with ONLY the JSON object.",
        },
      ],
      opts
    );
    return parseIntentJson(retry);
  } catch {
    return null;
  }
}

export type ExplanationContext = {
  carName: string;
  goalLabel: string;
  budgetLabel: string;
  engineLabel: string;
  warnings: string[];
  /** Computed in code — the only source for budget-fit wording. */
  budgetFacts: {
    budgetMax: number | null;
    items: {
      name: string;
      costMin: number;
      costMax: number;
      fitsAlone: boolean;
      minFits: boolean;
      maxFits: boolean;
    }[];
    comboWithinBudget: string[];
    comboMaxTotal: number;
  };
  parts: {
    name: string;
    costMin: number;
    costMax: number;
    fitment: string;
    benefit: string;
    installerTrade: string;
    fitsAlone: boolean;
  }[];
};

const EXPLAIN_SYSTEM = `You write a short, friendly Upgrade Advisor reply for AutoMod AI.
Hard rules:
- Use ONLY the facts in the JSON context (part names, prices, difficulty, installer trades, warnings, budgetFacts).
- Do NOT invent part names, brands, shops, or prices.
- Do NOT invent stock engine, displacement, horsepower, torque, or mileage figures for the car.
- Budget fit: describe whether items fit the budget ONLY using budgetFacts (fitsAlone / maxFits / minFits and comboWithinBudget). Never invent budget-fit claims. If fitsAlone is true, do not say the item is over budget, exceeds the budget, or does not fit within the budget.
- You may say several items together can exceed the ceiling only when referring to comboWithinBudget (items NOT in that list, or the sum of all max prices).
- Max ~120 words. Plain prose, no markdown lists unless needed.
- If there are zero parts, say the budget is too tight for curated options and suggest raising it or picking another goal.`;

export function buildExplainPrompt(ctx: ExplanationContext): { role: string; content: string }[] {
  return [
    { role: "system", content: EXPLAIN_SYSTEM },
    {
      role: "user",
      content: `Write a short explanation of these rule-engine recommendations:\n${JSON.stringify(ctx)}`,
    },
  ];
}

export async function explainWithLlm(
  ctx: ExplanationContext,
  opts: OllamaChatOptions & { model: string; onToken?: (t: string) => void }
): Promise<string> {
  const messages = buildExplainPrompt(ctx);
  if (opts.onToken) {
    return streamChat(messages, { ...opts, onToken: opts.onToken });
  }
  return chatOnce(messages, opts);
}
