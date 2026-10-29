import { describe, expect, it } from "vitest";
import { runAdvisorChat, GENERIC_CAR_BANNER } from "./chat";
import { matchCatalogueFromText } from "./recommend";

const offline = {
  fetchFn: async () => {
    throw new Error("ECONNREFUSED");
  },
};

describe("matchCatalogueFromText", () => {
  it("finds Hyundai Creta", () => {
    expect(matchCatalogueFromText("I drive a Hyundai Creta")?.id).toBe("hyundai-creta");
    expect(matchCatalogueFromText("my creta needs better brakes")?.model).toBe("Creta");
  });

  it("prefers the longest alias (Corolla Altis)", () => {
    expect(matchCatalogueFromText("2018 corolla altis")?.id).toBe("toyota-corolla-altis");
  });

  it("returns null for unknown cars", () => {
    expect(matchCatalogueFromText("I have a Porsche 911")).toBeNull();
    expect(matchCatalogueFromText("")).toBeNull();
  });
});

describe("advisor hub car resolution", () => {
  it("uses the selected car when provided", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "brakes under 30k" }],
      car: { make: "Hyundai", model: "Verna", year: 2020 },
      forceBasic: true,
    });
    expect(out.carResolution).toBe("selected");
    expect(out.car).toEqual({ make: "Hyundai", model: "Verna", year: 2020 });
    expect(out.carNoteBanner).toBeNull();
    expect(out.result?.knownCar?.id).toBe("hyundai-verna");
  });

  it("general mode with no car and no hint falls back to generic guidance", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "brakes under 30k on my petrol NA" }],
      car: null,
      forceBasic: true,
    });
    expect(out.carResolution).toBe("generic");
    expect(out.car).toEqual({ make: "General", model: "guidance", year: null });
    expect(out.carNoteBanner).toBe(GENERIC_CAR_BANNER);
    expect(out.result?.recommendations.length).toBeGreaterThan(0);
    expect(out.result?.knownCar).toBeNull();
  });

  it("general mode identifies a Creta from the message", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "I drive a Creta, brakes under 30k" }],
      forceBasic: true,
    });
    expect(out.carResolution).toBe("identified");
    expect(out.car).toMatchObject({ make: "Hyundai", model: "Creta" });
    expect(out.carNoteBanner).toBeNull();
    expect(out.result?.knownCar?.id).toBe("hyundai-creta");
  });

  it("general mode identifies a Verna even when only a car is named", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "it's a Hyundai Verna" }],
      forceBasic: true,
    });
    expect(out.carResolution).toBe("identified");
    expect(out.car).toMatchObject({ make: "Hyundai", model: "Verna" });
    // Still asks for the goal; no result yet.
    expect(out.result).toBeNull();
    expect(out.ask).toBeTruthy();
  });

  it("an identified car echoed by the client stays identified", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "more power under 50k" }],
      car: { make: "Hyundai", model: "Creta", year: null },
      carResolution: "identified",
      forceBasic: true,
    });
    expect(out.carResolution).toBe("identified");
    expect(out.result?.knownCar?.id).toBe("hyundai-creta");
  });

  it("Basic mode (Ollama down) still works with no car", async () => {
    const out = await runAdvisorChat({
      messages: [{ role: "user", content: "more power under 50k on my petrol NA" }],
      ollama: offline,
    });
    expect(out.mode).toBe("basic");
    expect(out.statusLabel).toBe("Basic mode");
    expect(out.carResolution).toBe("generic");
    expect(out.result?.recommendations.length).toBeGreaterThan(0);
    expect(out.explanationSource).toBe("template");
  });
});
