export type EditEngine = "fast" | "detailed";

export type ModCategory = "paint" | "wrap" | "wheels" | "hood" | "spoiler" | "body";

export type ModOption = {
  key: string;
  label: string;
  swatch?: string;
  /** Hidden options are not offered in the Studio for Fast (duplicates),
   *  but stay valid so saved builds with the old id still generate. */
  hidden?: boolean;
  /** Which engines expose this option. Default: Fast only. */
  engines?: EditEngine[];
};

export type ModCategoryConfig = {
  key: ModCategory;
  label: string;
  hint: string;
  options: ModOption[];
  /** If set, category chip only shows for these engines. */
  engines?: EditEngine[];
};

export const MOD_CATEGORIES: ModCategoryConfig[] = [
  {
    key: "paint",
    label: "Paint",
    hint: "Repaint the body in a new colour.",
    engines: ["fast"],
    options: [
      { key: "gloss_black", label: "Gloss black", swatch: "#111111", engines: ["fast"] },
      { key: "candy_red", label: "Candy red", swatch: "#b3122b", engines: ["fast"] },
      { key: "deep_blue", label: "Deep blue", swatch: "#14307a", engines: ["fast"] },
      { key: "emerald_green", label: "Emerald green", swatch: "#0d6b47", engines: ["fast"] },
      { key: "bright_orange", label: "Bright orange", swatch: "#f26a1b", engines: ["fast"] },
      { key: "sunshine_yellow", label: "Sunshine yellow", swatch: "#f7c600", engines: ["fast"] },
    ],
  },
  {
    key: "wrap",
    label: "Wrap",
    hint: "Apply a vinyl wrap with a matte or satin finish.",
    options: [
      { key: "matte_black", label: "Matte black", swatch: "#1b1b1b", engines: ["fast", "detailed"] },
      { key: "satin_blue", label: "Satin blue", swatch: "#2a5db0", engines: ["fast"] },
      { key: "satin_purple", label: "Satin purple", swatch: "#5b2a86", engines: ["fast"] },
      { key: "matte_green", label: "Matte army green", swatch: "#4b5a34", engines: ["fast"] },
      { key: "gloss_teal", label: "Gloss teal", swatch: "#0f8a8a", engines: ["fast"] },
      { key: "satin_orange", label: "Satin orange", swatch: "#e8590c", engines: ["fast"] },
    ],
  },
  {
    key: "wheels",
    label: "Wheels",
    hint: "Swap the rims for a new finish.",
    options: [
      { key: "gloss_black", label: "Gloss black", swatch: "#111111", engines: ["fast"] },
      { key: "gold", label: "Gold", swatch: "#c9a227", engines: ["fast"] },
      { key: "bronze", label: "Bronze", swatch: "#8c5a2b", engines: ["fast", "detailed"] },
      { key: "white", label: "White", swatch: "#f2f2f2", engines: ["fast"] },
    ],
  },
  {
    key: "hood",
    label: "Hood",
    hint: "Change the hood finish. Works best on lighter-coloured cars.",
    options: [
      { key: "matte_black", label: "Matte black", swatch: "#1b1b1b", engines: ["fast"] },
      { key: "carbon_fibre", label: "Carbon fibre", swatch: "#2b2b2b", engines: ["fast", "detailed"] },
      { key: "gloss_red", label: "Gloss red", swatch: "#c1121f", engines: ["fast"] },
    ],
  },
  {
    key: "spoiler",
    label: "Spoiler",
    hint: "Add a rear spoiler. Use a rear-facing photo.",
    options: [
      // Fast: roof_spoiler = lip, ducktail = ducktail; gt_wing hidden (same Fast render).
      // Detailed: distinct locked prompts for lip_spoiler, ducktail, gt_wing.
      { key: "gt_wing", label: "GT wing", hidden: true, engines: ["detailed"] },
      { key: "roof_spoiler", label: "Lip spoiler", engines: ["fast"] },
      { key: "lip_spoiler", label: "Lip spoiler", engines: ["detailed"] },
      { key: "ducktail", label: "Ducktail spoiler", engines: ["fast", "detailed"] },
    ],
  },
  {
    key: "body",
    label: "Body kit",
    hint: "Add skirts, lips, diffuser or gloss-black bumper finishes. Detailed engine only.",
    engines: ["detailed"],
    options: [
      { key: "side_skirts", label: "Side skirts", engines: ["detailed"] },
      { key: "front_lip", label: "Front lip", engines: ["detailed"] },
      { key: "rear_diffuser", label: "Rear diffuser", engines: ["detailed"] },
      { key: "front_bumper_finish", label: "Front bumper gloss black", engines: ["detailed"] },
      { key: "rear_bumper_finish", label: "Rear bumper gloss black", engines: ["detailed"] },
    ],
  },
];

function optionEngines(o: ModOption): EditEngine[] {
  return o.engines ?? ["fast"];
}

/** Categories that have at least one visible option for this engine. */
export function visibleCategories(engine: EditEngine = "fast"): ModCategoryConfig[] {
  return MOD_CATEGORIES.filter((c) => {
    if (c.engines && !c.engines.includes(engine)) return false;
    return visibleOptions(c, engine).length > 0;
  });
}

/** Options the Studio should offer for an engine. */
export function visibleOptions(
  category: ModCategoryConfig,
  engine: EditEngine = "fast"
): ModOption[] {
  return category.options.filter((o) => {
    if (!optionEngines(o).includes(engine)) return false;
    // Fast still hides legacy duplicates flagged hidden.
    if (engine === "fast" && o.hidden) return false;
    return true;
  });
}

export function isValidMod(category: string, option: string, engine?: EditEngine): boolean {
  const cat = MOD_CATEGORIES.find((c) => c.key === category);
  if (!cat) return false;
  const opt = cat.options.find((o) => o.key === option);
  if (!opt) return false;
  if (engine && !optionEngines(opt).includes(engine)) return false;
  return true;
}

export function modLabel(category: string, option: string): string {
  const cat = MOD_CATEGORIES.find((c) => c.key === category);
  const opt = cat?.options.find((o) => o.key === option);
  return cat && opt ? `${cat.label}: ${opt.label}` : category;
}

/** Qwen prompts.json part key for a Detailed category/option, or null. */
export function detailedPartKey(category: string, option: string): string | null {
  const map: Record<string, string> = {
    "spoiler:lip_spoiler": "lip_spoiler",
    "spoiler:ducktail": "ducktail",
    "spoiler:gt_wing": "gt_wing",
    "body:side_skirts": "side_skirts",
    "body:front_lip": "front_lip",
    "body:rear_diffuser": "rear_diffuser",
    "body:front_bumper_finish": "front_bumper_finish",
    "body:rear_bumper_finish": "rear_bumper_finish",
    "wheels:bronze": "wheels_bronze",
    "hood:carbon_fibre": "hood_carbon_fibre",
    "wrap:matte_black": "wrap_matte_black",
  };
  return map[`${category}:${option}`] ?? null;
}

/**
 * Conceptual pairs that can be compared across engines.
 * Fast lip uses `roof_spoiler`; Detailed uses `lip_spoiler`.
 */
const COMPARE_PAIRS: Array<{
  category: string;
  fast: string;
  detailed: string;
}> = [
  { category: "spoiler", fast: "ducktail", detailed: "ducktail" },
  { category: "spoiler", fast: "roof_spoiler", detailed: "lip_spoiler" },
  { category: "wrap", fast: "matte_black", detailed: "matte_black" },
  { category: "wheels", fast: "bronze", detailed: "bronze" },
  { category: "hood", fast: "carbon_fibre", detailed: "carbon_fibre" },
];

/** True when this category/option has a counterpart on the other engine. */
export function canCompareEngines(category: string, option: string): boolean {
  return COMPARE_PAIRS.some(
    (p) =>
      p.category === category && (p.fast === option || p.detailed === option)
  );
}

/** Map a mod to the equivalent option on the target engine, or null. */
export function counterpartMod(
  category: string,
  option: string,
  target: EditEngine
): { category: string; option: string } | null {
  const pair = COMPARE_PAIRS.find(
    (p) =>
      p.category === category && (p.fast === option || p.detailed === option)
  );
  if (!pair) return null;
  return { category: pair.category, option: target === "fast" ? pair.fast : pair.detailed };
}

/** Rough ETA note before starting a cross-engine compare. */
export function compareEtaMinutes(fromEngine: EditEngine): { minutes: number; note: string } {
  // Other engine runs next through the shared one-job queue.
  if (fromEngine === "fast") {
    return { minutes: 4, note: "This will take about 4 minutes (Detailed edit)." };
  }
  return { minutes: 2, note: "This will take about 1–2 minutes (Fast edit)." };
}
