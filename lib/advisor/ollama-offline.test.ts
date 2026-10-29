import { afterEach, describe, expect, it, vi } from "vitest";
import { probeOllama, shouldProbeOllama } from "./ollama";
import { runAdvisorChat } from "./chat";

describe("Ollama offline on hosted showcase", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.OLLAMA_URL;
    vi.unstubAllGlobals();
  });

  it("shouldProbeOllama is false on Vercel without OLLAMA_URL", () => {
    process.env.VERCEL = "1";
    delete process.env.OLLAMA_URL;
    expect(shouldProbeOllama()).toBe(false);
  });

  it("shouldProbeOllama stays true locally when OLLAMA_URL is unset", () => {
    delete process.env.VERCEL;
    delete process.env.OLLAMA_URL;
    expect(shouldProbeOllama()).toBe(true);
  });

  it("probeOllama returns not-ok immediately on Vercel without hanging on localhost", async () => {
    process.env.VERCEL = "1";
    delete process.env.OLLAMA_URL;
    const status = await probeOllama();
    expect(status.ok).toBe(false);
    expect(status.reason).toMatch(/not configured/i);
  });

  it("Advisor falls back to Basic with recommendations when Ollama is unreachable (no throw)", async () => {
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
    expect(out.explanationSource).toBe("template");
    expect(out.result?.recommendations.length).toBeGreaterThan(0);
    expect(out.explanation.length).toBeGreaterThan(20);
  });

  it("Advisor on Vercel without OLLAMA_URL uses Basic without probing", async () => {
    process.env.VERCEL = "1";
    delete process.env.OLLAMA_URL;
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "louder exhaust under 30 thousand petrol NA" }],
      car: { make: "Hyundai", model: "Verna", year: 2020 },
    });
    expect(out.mode).toBe("basic");
    expect(out.statusLabel).toBe("Basic mode");
    expect(out.explanationSource).toBe("template");
  });
});
