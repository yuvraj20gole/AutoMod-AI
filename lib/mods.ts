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
  /** Newly ported Detailed options — show an Experimental tag in Studio. */
  experimental?: boolean;
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
    engines: ["fast", "detailed"],
    options: [
      { key: "gloss_black", label: "Gloss black", swatch: "#111111", engines: ["fast", "detailed"], experimental: true },
      { key: "candy_red", label: "Candy red", swatch: "#b3122b", engines: ["fast", "detailed"], experimental: true },
      { key: "deep_blue", label: "Deep blue", swatch: "#14307a", engines: ["fast", "detailed"], experimental: true },
      { key: "emerald_green", label: "Emerald green", swatch: "#0d6b47", engines: ["fast", "detailed"], experimental: true },
      { key: "bright_orange", label: "Bright orange", swatch: "#f26a1b", engines: ["fast", "detailed"], experimental: true },
      { key: "sunshine_yellow", label: "Sunshine yellow", swatch: "#f7c600", engines: ["fast", "detailed"], experimental: true },
    ],
  },
  {
    key: "wrap",
    label: "Wrap",
    hint: "Apply a vinyl wrap with a matte or satin finish.",
    options: [
      { key: "matte_black", label: "Matte black", swatch: "#1b1b1b", engines: ["fast", "detailed"] },
      { key: "satin_blue", label: "Satin blue", swatch: "#2a5db0", engines: ["fast", "detailed"], experimental: true },
      { key: "satin_purple", label: "Satin purple", swatch: "#5b2a86", engines: ["fast", "detailed"], experimental: true },
      { key: "matte_green", label: "Matte army green", swatch: "#4b5a34", engines: ["fast", "detailed"], experimental: true },
      { key: "gloss_teal", label: "Gloss teal", swatch: "#0f8a8a", engines: ["fast", "detailed"], experimental: true },
      { key: "satin_orange", label: "Satin orange", swatch: "#e8590c", engines: ["fast", "detailed"], experimental: true },
    ],
  },
  {
    key: "wheels",
    label: "Wheels",
    hint: "Swap the rims for a new finish.",
    options: [
      { key: "gloss_black", label: "Gloss black", swatch: "#111111", engines: ["fast", "detailed"], experimental: true },
      { key: "gold", label: "Gold", swatch: "#c9a227", engines: ["fast", "detailed"], experimental: true },
      { key: "bronze", label: "Bronze", swatch: "#8c5a2b", engines: ["fast", "detailed"] },
      { key: "white", label: "White", swatch: "#f2f2f2", engines: ["fast", "detailed"], experimental: true },
    ],
  },
  {
    key: "hood",
    label: "Hood",
    hint: "Change the hood finish. Works best on lighter-coloured cars.",
    options: [
      { key: "matte_black", label: "Matte black", swatch: "#1b1b1b", engines: ["fast", "detailed"], experimental: true },
      { key: "carbon_fibre", label: "Carbon fibre", swatch: "#2b2b2b", engines: ["fast", "detailed"] },
      { key: "gloss_red", label: "Gloss red", swatch: "#c1121f", engines: ["fast", "detailed"], experimental: true },
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
    "wheels:gloss_black": "wheels_gloss_black",
    "wheels:gold": "wheels_gold",
    "wheels:white": "wheels_white",
    "hood:carbon_fibre": "hood_carbon_fibre",
    "hood:matte_black": "hood_matte_black",
    "hood:gloss_red": "hood_gloss_red",
    "wrap:matte_black": "wrap_matte_black",
    "wrap:satin_blue": "wrap_satin_blue",
    "wrap:satin_purple": "wrap_satin_purple",
    "wrap:matte_green": "wrap_matte_green",
    "wrap:gloss_teal": "wrap_gloss_teal",
    "wrap:satin_orange": "wrap_satin_orange",
    "paint:gloss_black": "paint_gloss_black",
    "paint:candy_red": "paint_candy_red",
    "paint:deep_blue": "paint_deep_blue",
    "paint:emerald_green": "paint_emerald_green",
    "paint:bright_orange": "paint_bright_orange",
    "paint:sunshine_yellow": "paint_sunshine_yellow",
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
  { category: "wrap", fast: "satin_blue", detailed: "satin_blue" },
  { category: "wrap", fast: "satin_purple", detailed: "satin_purple" },
  { category: "wrap", fast: "matte_green", detailed: "matte_green" },
  { category: "wrap", fast: "gloss_teal", detailed: "gloss_teal" },
  { category: "wrap", fast: "satin_orange", detailed: "satin_orange" },
  { category: "wheels", fast: "bronze", detailed: "bronze" },
  { category: "wheels", fast: "gloss_black", detailed: "gloss_black" },
  { category: "wheels", fast: "gold", detailed: "gold" },
  { category: "wheels", fast: "white", detailed: "white" },
  { category: "hood", fast: "carbon_fibre", detailed: "carbon_fibre" },
  { category: "hood", fast: "matte_black", detailed: "matte_black" },
  { category: "hood", fast: "gloss_red", detailed: "gloss_red" },
  { category: "paint", fast: "gloss_black", detailed: "gloss_black" },
  { category: "paint", fast: "candy_red", detailed: "candy_red" },
  { category: "paint", fast: "deep_blue", detailed: "deep_blue" },
  { category: "paint", fast: "emerald_green", detailed: "emerald_green" },
  { category: "paint", fast: "bright_orange", detailed: "bright_orange" },
  { category: "paint", fast: "sunshine_yellow", detailed: "sunshine_yellow" },
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
