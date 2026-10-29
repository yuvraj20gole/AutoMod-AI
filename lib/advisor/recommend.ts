import {
  CAR_CATALOGUE,
  UPGRADES,
  ENGINE_LABEL,
  guessBodyType,
  type BodyType,
  type CatalogueCar,
  type EngineType,
  type Goal,
  type UpgradeOption,
} from "./data";

/**
 * Deterministic, rule-based recommendation engine.
 * Same input always gives the same output — no model, no randomness,
 * no network. All knowledge lives in data.ts.
 */

export type AdvisorCar = { make: string; model: string; year: number | null };

export type BuyLinks = {
  amazon: string;
  flipkart: string;
  mapsFitting: string;
  mapsMumbai: string;
};

export type Recommendation = UpgradeOption & {
  /** "Can this build take it?" — rule-based checks for this car + option. */
  buildChecks: string[];
  shopMustFit: boolean;
  fitmentLabel: string;
  links: BuyLinks;
};

export type AdvisorResult = {
  knownCar: CatalogueCar | null;
  bodyType: BodyType;
  engineType: EngineType;
  engineSource: "catalogue" | "user" | "assumption";
  /** Whole-advisor warnings, e.g. age-related checks before power mods. */
  warnings: string[];
  /**
   * Car-specific note shown once under the recommendations heading —
   * not repeated inside every card's buildChecks.
   */
  carNote: string | null;
  recommendations: Recommendation[];
};

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Find the curated catalogue entry for a cars-table make/model, if any. */
export function findCatalogueCar(make: string, model: string): CatalogueCar | null {
  const modelN = normalise(model);
  const makeN = normalise(make);
  for (const car of CAR_CATALOGUE) {
    if (normalise(car.make) !== makeN) continue;
    if (car.aliases.some((a) => modelN.includes(normalise(a)) || normalise(a).includes(modelN))) {
      return car;
    }
  }
  return null;
}

/** Engine pre-fill: catalogue value for known models, else null (ask). */
export function prefilledEngine(make: string, model: string): EngineType | null {
  return findCatalogueCar(make, model)?.engineType ?? null;
}

/**
 * Generated links only — marketplace/maps *searches*, never invented
 * product pages, prices or shop names.
 */
export function buildLinks(make: string, model: string, searchTerm: string): BuyLinks {
  const partQuery = encodeURIComponent(`${make} ${model} ${searchTerm}`.trim());
  const fittingQuery = encodeURIComponent(`${searchTerm} fitting shop near me`);
  const mumbaiQuery = encodeURIComponent("car modification shop Mumbai");
  return {
    amazon: `https://www.amazon.in/s?k=${partQuery}`,
    flipkart: `https://www.flipkart.com/search?q=${partQuery}`,
    mapsFitting: `https://www.google.com/maps/search/?api=1&query=${fittingQuery}`,
    mapsMumbai: `https://www.google.com/maps/search/?api=1&query=${mumbaiQuery}`,
  };
}

/**
 * "Find an installer" link: a Google Maps *search* for the trade near
 * the user. Links only — no business names, ratings, phone numbers or
 * addresses are ever generated, and no external API is called.
 */
export function buildInstallerLink(mapsQuery: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapsQuery} near me`)}`;
}

const FITMENT_LABEL: Record<UpgradeOption["fitment"], string> = {
  diy: "Can be fitted at home with basic tools — a mechanic is not required.",
  mechanic: "Needs a mechanic — take it to a trusted local mechanic.",
  shop: "Needs a specialist shop — this is not a home or quick-fit job.",
};

/** Older-car threshold: at this age, wear parts come before power. */
export const OLDER_CAR_AGE_YEARS = 10;

function buildChecks(
  option: UpgradeOption,
  ctx: {
    car: AdvisorCar;
    catalogue: CatalogueCar | null;
    engineType: EngineType;
    bodyType: BodyType;
    ageYears: number | null;
  }
): string[] {
  const checks: string[] = [option.buildCheck];

  // Rule: naturally aspirated petrol only gains mildly from intake/exhaust.
  if (
    ctx.engineType === "petrol_na" &&
    (option.id === "cold-air-intake" || option.id === "catback-exhaust" || option.id === "na-ecu-tune")
  ) {
    checks.push(
      "Naturally aspirated rule: intake and exhaust changes give mild gains only on this engine — set expectations to response and sound, not big power."
    );
  }

  // Rule: turbo tune needs clutch + cooling headroom (also in option text,
  // repeated as an explicit check so it can never be missed).
  if (ctx.engineType === "petrol_turbo" && (option.id === "turbo-stage1-remap" || option.id === "intercooler-upgrade")) {
    checks.push(
      "Before any tune: confirm the clutch can handle the extra torque (fit an uprated, supercharged-ready-spec clutch if yours is worn) and get the cooling system checked — radiator, hoses, coolant and boost pipes."
    );
  }

  // Rule: diesel remaps raise heat and clutch wear.
  if (ctx.engineType === "diesel" && option.id === "diesel-stage1-remap") {
    checks.push(
      "Diesel rule: a remap raises exhaust heat and clutch wear. Check clutch slip, coolant condition and DPF health first, and choose a conservative tune."
    );
  }

  // Rule: older cars get brakes/suspension checked before power.
  if (
    ctx.ageYears !== null &&
    ctx.ageYears >= OLDER_CAR_AGE_YEARS &&
    (option.goals.includes("power") || option.goals.includes("exhaust"))
  ) {
    checks.push(
      `Your car is about ${ctx.ageYears} years old: have the brakes and suspension checked (and refreshed if worn) before spending on power — tired brakes and dampers are the limiting factor, not the engine.`
    );
  }

  return checks;
}

export function recommend(input: {
  car: AdvisorCar;
  goal: Goal;
  /** User-confirmed engine; falls back to catalogue, then petrol NA. */
  engineType?: EngineType | null;
  /** Spending ceiling in ₹. Infinity = no ceiling. */
  budgetMax: number;
  /** Injectable for deterministic tests. Defaults to the current year. */
  currentYear?: number;
}): AdvisorResult {
  const { car, goal } = input;
  const currentYear = input.currentYear ?? new Date().getFullYear();
  const catalogue = findCatalogueCar(car.make, car.model);
  const bodyType: BodyType = catalogue?.bodyType ?? guessBodyType(car.model);

  const engineType: EngineType = input.engineType ?? catalogue?.engineType ?? "petrol_na";
  const engineSource: AdvisorResult["engineSource"] = input.engineType
    ? "user"
    : catalogue
      ? "catalogue"
      : "assumption";

  const ageYears = car.year ? currentYear - car.year : null;

  const warnings: string[] = [];
  if (ageYears !== null && ageYears >= OLDER_CAR_AGE_YEARS && (goal === "power" || goal === "exhaust")) {
    warnings.push(
      `This car is about ${ageYears} years old. Before power or exhaust work, have the brakes and suspension checked — on an older car those wear out first and decide whether extra power is safe to use.`
    );
  }
  if (!catalogue) {
    warnings.push(
      `No curated entry for the ${car.make} ${car.model} yet, so these are generic recommendations for its body and engine type. Confirm exact fitment for your variant before buying anything.`
    );
  }

  const recommendations = UPGRADES.filter((o) => o.goals.includes(goal))
    .filter((o) => o.engines === "all" || o.engines.includes(engineType))
    .filter((o) => !o.carIds || (catalogue !== null && o.carIds.includes(catalogue.id)))
    .filter((o) => !o.bodyTypes || (bodyType !== "unknown" && o.bodyTypes.includes(bodyType)))
    // Budget rule: the option's whole cost range must fit the ceiling.
    .filter((o) => o.costMax <= input.budgetMax)
    .map((o) => ({
      ...o,
      buildChecks: buildChecks(o, { car, catalogue, engineType, bodyType, ageYears }),
      shopMustFit: o.fitment !== "diy",
      fitmentLabel: FITMENT_LABEL[o.fitment],
      links: buildLinks(car.make, car.model, o.searchTerm),
    }))
    // Best value first; deterministic tie-breaks so order never shuffles.
    .sort(
      (a, b) =>
        b.valueScore - a.valueScore || a.costMin - b.costMin || a.name.localeCompare(b.name)
    );

  const carNote = catalogue
    ? `For your ${catalogue.make} ${catalogue.model}: ${catalogue.buildNote}`
    : `We don't have curated notes for the ${car.make} ${car.model}, so this is generic ${bodyType} / ${ENGINE_LABEL[engineType]} guidance — fitment must be confirmed for your exact variant before ordering.`;

  return {
    knownCar: catalogue,
    bodyType,
    engineType,
    engineSource,
    warnings,
    carNote,
    recommendations,
  };
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function formatCostRange(costMin: number, costMax: number): string {
  return `${formatINR(costMin)} – ${formatINR(costMax)}`;
}
