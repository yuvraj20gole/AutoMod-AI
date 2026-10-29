import { describe, expect, it } from "vitest";
import {
  buildLinks,
  findCatalogueCar,
  formatCostRange,
  prefilledEngine,
  recommend,
} from "./recommend";

const COROLLA = { make: "Toyota", model: "Corolla Altis", year: 2018 };
const CURRENT_YEAR = 2026;

describe("catalogue lookup", () => {
  it("finds the curated Corolla Altis entry and pre-fills petrol NA", () => {
    expect(findCatalogueCar("Toyota", "Corolla Altis")?.id).toBe("toyota-corolla-altis");
    expect(findCatalogueCar("Toyota", "Corolla")?.id).toBe("toyota-corolla-altis");
    expect(prefilledEngine("Toyota", "Corolla Altis")).toBe("petrol_na");
  });

  it("finds the other curated models case-insensitively", () => {
    expect(prefilledEngine("hyundai", "Verna")).toBe("petrol_na");
    expect(prefilledEngine("Honda", "City")).toBe("petrol_na");
    expect(findCatalogueCar("Hyundai", "Creta")?.bodyType).toBe("suv");
  });

  it("returns null for an unknown model (generic fallback)", () => {
    expect(findCatalogueCar("Maruti Suzuki", "Baleno")).toBeNull();
    expect(prefilledEngine("Maruti Suzuki", "Baleno")).toBeNull();
  });
});

describe("recommend() — Corolla Altis, More power, ₹30,000–₹1,00,000", () => {
  const result = recommend({
    car: COROLLA,
    goal: "power",
    budgetMax: 100_000,
    currentYear: CURRENT_YEAR,
  });

  it("resolves the catalogue car, sedan body and NA engine", () => {
    expect(result.knownCar?.id).toBe("toyota-corolla-altis");
    expect(result.bodyType).toBe("sedan");
    expect(result.engineType).toBe("petrol_na");
    expect(result.engineSource).toBe("catalogue");
  });

  it("only returns options whose whole cost range fits the budget", () => {
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const r of result.recommendations) {
      expect(r.costMax).toBeLessThanOrEqual(100_000);
      expect(r.goals).toContain("power");
    }
  });

  it("ranks best value first with deterministic tie-breaks", () => {
    const scores = result.recommendations.map((r) => r.valueScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.recommendations[0].id).toBe("panel-filter");
  });

  it("never offers a turbo or diesel remap to a naturally aspirated car", () => {
    const ids = result.recommendations.map((r) => r.id);
    expect(ids).not.toContain("turbo-stage1-remap");
    expect(ids).not.toContain("diesel-stage1-remap");
    expect(ids).toContain("na-ecu-tune");
  });

  it("spells out the mild-gains rule for NA intake/exhaust/tune options", () => {
    const tune = result.recommendations.find((r) => r.id === "na-ecu-tune");
    expect(tune?.benefit).toMatch(/mild gains only/i);
    expect(tune?.buildChecks.join(" ")).toMatch(/naturally aspirated rule/i);
  });

  it("surfaces the car-specific note once on the result, not on every card", () => {
    expect(result.carNote).toMatch(/Altis was discontinued in 2020/i);
    for (const r of result.recommendations) {
      expect(r.buildChecks.join(" ")).not.toMatch(/Altis was discontinued in 2020/i);
      expect(r.buildChecks.join(" ")).not.toMatch(/^For your Toyota Corolla Altis:/);
    }
  });

  it("includes warranty, insurance and RTO risks on the NA tune", () => {
    const tune = result.recommendations.find((r) => r.id === "na-ecu-tune");
    const risks = tune?.risks.join(" ") ?? "";
    expect(risks).toMatch(/warranty/i);
    expect(risks).toMatch(/insurer/i);
    expect(risks).toMatch(/RTO legality \(India\)/);
  });

  it("flags that the older car needs brakes/suspension checked before power", () => {
    // 2026 − 2018 = 8 years is under the threshold, so no warning yet…
    expect(result.warnings.join(" ")).not.toMatch(/brakes and suspension/i);
    const older = recommend({
      car: { ...COROLLA, year: 2014 },
      goal: "power",
      budgetMax: 100_000,
      currentYear: CURRENT_YEAR,
    });
    expect(older.warnings.join(" ")).toMatch(/brakes and suspension/i);
    const intake = older.recommendations.find((r) => r.id === "cold-air-intake");
    expect(intake?.buildChecks.join(" ")).toMatch(/brakes and suspension/i);
  });

  it("generates search links only — Amazon.in, Flipkart, Google Maps", () => {
    for (const r of result.recommendations) {
      expect(r.links.amazon).toMatch(/^https:\/\/www\.amazon\.in\/s\?k=/);
      expect(r.links.amazon).toContain(encodeURIComponent("Toyota Corolla Altis"));
      expect(r.links.flipkart).toMatch(/^https:\/\/www\.flipkart\.com\/search\?q=/);
      expect(r.links.mapsFitting).toContain("google.com/maps/search");
      expect(decodeURIComponent(r.links.mapsFitting)).toContain("fitting shop near me");
      expect(decodeURIComponent(r.links.mapsMumbai)).toContain("car modification shop Mumbai");
    }
  });

  it("says whether a shop/mechanic must fit each option", () => {
    const filter = result.recommendations.find((r) => r.id === "panel-filter");
    expect(filter?.shopMustFit).toBe(false);
    const tune = result.recommendations.find((r) => r.id === "na-ecu-tune");
    expect(tune?.shopMustFit).toBe(true);
    expect(tune?.fitmentLabel).toMatch(/specialist shop/i);
  });
});

describe("recommend() — budget filtering", () => {
  it("excludes options whose cost range exceeds a small budget", () => {
    const result = recommend({
      car: COROLLA,
      goal: "power",
      budgetMax: 10_000,
      currentYear: CURRENT_YEAR,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(
      expect.arrayContaining(["panel-filter"])
    );
    expect(result.recommendations.every((r) => r.costMax <= 10_000)).toBe(true);
    expect(result.recommendations.map((r) => r.id)).not.toContain("na-ecu-tune");
  });

  it("includes the big brake kit only above ₹1,00,000", () => {
    const mid = recommend({ car: COROLLA, goal: "brakes", budgetMax: 100_000, currentYear: CURRENT_YEAR });
    expect(mid.recommendations.map((r) => r.id)).not.toContain("big-brake-kit");
    const high = recommend({
      car: COROLLA,
      goal: "brakes",
      budgetMax: Number.POSITIVE_INFINITY,
      currentYear: CURRENT_YEAR,
    });
    expect(high.recommendations.map((r) => r.id)).toContain("big-brake-kit");
  });
});

describe("recommend() — engine rules", () => {
  it("gives a turbo car a Stage 1 remap with clutch + cooling checks", () => {
    const result = recommend({
      car: { make: "Hyundai", model: "Verna", year: 2023 },
      goal: "power",
      engineType: "petrol_turbo",
      budgetMax: 100_000,
      currentYear: CURRENT_YEAR,
    });
    const remap = result.recommendations.find((r) => r.id === "turbo-stage1-remap");
    expect(remap).toBeDefined();
    expect(remap?.buildChecks.join(" ")).toMatch(/clutch/i);
    expect(remap?.buildChecks.join(" ")).toMatch(/cooling/i);
  });

  it("warns diesel remaps raise heat and clutch wear", () => {
    const result = recommend({
      car: { make: "Hyundai", model: "Creta", year: 2020 },
      goal: "power",
      engineType: "diesel",
      budgetMax: 100_000,
      currentYear: CURRENT_YEAR,
    });
    const remap = result.recommendations.find((r) => r.id === "diesel-stage1-remap");
    expect(remap?.risks.join(" ")).toMatch(/heat and clutch wear/i);
    expect(remap?.buildChecks.join(" ")).toMatch(/diesel rule/i);
    expect(result.bodyType).toBe("suv");
  });

  it("respects a user-confirmed engine over the catalogue pre-fill", () => {
    const result = recommend({
      car: COROLLA,
      goal: "power",
      engineType: "diesel",
      budgetMax: 100_000,
      currentYear: CURRENT_YEAR,
    });
    expect(result.engineType).toBe("diesel");
    expect(result.engineSource).toBe("user");
  });
});

describe("recommend() — generic fallback", () => {
  it("still recommends for an unknown car, with a fallback warning", () => {
    const result = recommend({
      car: { make: "Maruti Suzuki", model: "Baleno", year: 2022 },
      goal: "brakes",
      engineType: "petrol_na",
      budgetMax: 30_000,
      currentYear: CURRENT_YEAR,
    });
    expect(result.knownCar).toBeNull();
    expect(result.bodyType).toBe("hatchback");
    expect(result.warnings.join(" ")).toMatch(/generic recommendations/i);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].id).toBe("performance-pads");
  });
});

describe("determinism and formatting", () => {
  it("returns identical output for identical input", () => {
    const input = { car: COROLLA, goal: "power" as const, budgetMax: 100_000, currentYear: CURRENT_YEAR };
    expect(recommend(input)).toEqual(recommend(input));
  });

  it("formats rupee ranges in en-IN style", () => {
    expect(formatCostRange(30_000, 100_000)).toBe("₹30,000 – ₹1,00,000");
  });

  it("buildLinks encodes the make + model + part query", () => {
    const links = buildLinks("Toyota", "Corolla Altis", "performance air filter");
    expect(links.amazon).toBe(
      "https://www.amazon.in/s?k=Toyota%20Corolla%20Altis%20performance%20air%20filter"
    );
  });
});
