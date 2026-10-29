/**
 * Curated, hand-maintained data for the Upgrade Advisor.
 *
 * This is NOT live data: prices are broad, honest ranges (₹) for parts +
 * typical fitting in India at the time of the last review, and benefits are
 * deliberately conservative. Nothing here is scraped or fetched, so it can
 * never drift into invented live prices. Bump LAST_REVIEWED whenever the
 * ranges are re-checked.
 */
export const LAST_REVIEWED = "October 2026";

export const ADVISOR_DISCLAIMER =
  "This is general guidance from curated data, not an engineering guarantee, so check with a qualified mechanic before buying.";

export type Goal =
  | "power"
  | "exhaust"
  | "suspension"
  | "brakes"
  | "wheels"
  | "looks";

export type EngineType = "petrol_na" | "petrol_turbo" | "diesel";

export type BodyType = "sedan" | "hatchback" | "suv" | "unknown";

export type Fitment = "diy" | "mechanic" | "shop";

export const GOALS: { key: Goal; label: string; question: string }[] = [
  { key: "power", label: "More power", question: "What do you want to upgrade?" },
  { key: "exhaust", label: "Exhaust", question: "What do you want to upgrade?" },
  { key: "suspension", label: "Suspension and handling", question: "What do you want to upgrade?" },
  { key: "brakes", label: "Brakes", question: "What do you want to upgrade?" },
  { key: "wheels", label: "Wheels and tyres", question: "What do you want to upgrade?" },
  { key: "looks", label: "Looks and lighting", question: "What do you want to upgrade?" },
];

export const ENGINE_TYPES: { key: EngineType; label: string }[] = [
  { key: "petrol_na", label: "Petrol, naturally aspirated" },
  { key: "petrol_turbo", label: "Petrol, turbo" },
  { key: "diesel", label: "Diesel" },
];

export const ENGINE_LABEL: Record<EngineType, string> = {
  petrol_na: "petrol naturally aspirated",
  petrol_turbo: "petrol turbo",
  diesel: "diesel",
};

/** Budget presets. A preset is a spending ceiling: an option "fits" only
 *  when its whole cost range sits at or under the ceiling. */
export const BUDGET_PRESETS: { id: string; label: string; max: number }[] = [
  { id: "under-10k", label: "Under ₹10,000", max: 10_000 },
  { id: "10k-30k", label: "₹10,000 to ₹30,000", max: 30_000 },
  { id: "30k-1l", label: "₹30,000 to ₹1,00,000", max: 100_000 },
  { id: "above-1l", label: "Above ₹1,00,000", max: Number.POSITIVE_INFINITY },
];

export type CatalogueCar = {
  id: string;
  make: string;
  model: string;
  /** Lower-cased strings matched against the cars-table model/make. */
  aliases: string[];
  bodyType: Exclude<BodyType, "unknown">;
  /** Most common engine for this model in India — used as the pre-fill. */
  engineType: EngineType;
  engineNote: string;
  /** Shown in the "Can this build take it?" check for this car. */
  buildNote: string;
};

export const CAR_CATALOGUE: CatalogueCar[] = [
  {
    id: "hyundai-verna",
    make: "Hyundai",
    model: "Verna",
    aliases: ["verna"],
    bodyType: "sedan",
    engineType: "petrol_na",
    engineNote:
      "Most Vernas in India are the 1.5 petrol (naturally aspirated). A 1.0 turbo petrol was also sold — pick “Petrol, turbo” if that is yours.",
    buildNote:
      "The Verna's torsion-beam rear keeps upgrades simple and cheap, but it also limits how much extra power the chassis uses well — modest gains suit this car best.",
  },
  {
    id: "toyota-corolla-altis",
    make: "Toyota",
    model: "Corolla Altis",
    aliases: ["corolla altis", "corolla"],
    bodyType: "sedan",
    engineType: "petrol_na",
    engineNote:
      "Indian Corolla Altis cars are almost all the 1.8 petrol (naturally aspirated). A rare 1.4 diesel exists — pick “Diesel” if that is yours.",
    buildNote:
      "The 1.8 engine is strong and long-lived, but the Altis was discontinued in 2020, so every example is now several years old: rubber bushes, dampers and brake hoses age out before the engine does. Check those before chasing power.",
  },
  {
    id: "honda-city",
    make: "Honda",
    model: "City",
    aliases: ["city"],
    bodyType: "sedan",
    engineType: "petrol_na",
    engineNote:
      "Most Citys are the 1.5 petrol (naturally aspirated). Older cars also came as a 1.5 diesel — pick “Diesel” if that is yours.",
    buildNote:
      "The City is light for its size, so tyres, brakes and suspension changes are felt more than small power gains. Keep modifications modest and the car stays reliable.",
  },
  {
    id: "hyundai-creta",
    make: "Hyundai",
    model: "Creta",
    aliases: ["creta"],
    bodyType: "suv",
    engineType: "petrol_na",
    engineNote:
      "Most Cretas are the 1.5 petrol (naturally aspirated). 1.0/1.5 turbo petrol and 1.5 diesel versions were also sold — pick the one that matches your car.",
    buildNote:
      "The Creta sits tall, so body roll — not power — is usually what owners notice first. Check tyre size and load rating carefully: SUV tyres must carry the car's weight, not just fit the rim.",
  },
];

export type UpgradeOption = {
  id: string;
  name: string;
  /** Who fits this, and the Google Maps *search* phrase used to find
   *  one. Searches only — never a hard-coded business, rating, phone
   *  number or address (see buildInstallerLink in recommend.ts). */
  installer: { trade: string; mapsQuery: string; note?: string };
  /** True only when the option changes the whole body colour (a full
   *  wrap / repaint) — the RC/insurer legal note applies. Partial or
   *  reversible cosmetics (roof wrap, spoiler, wheels) stay false. */
  colourChange?: boolean;
  /** Words used to build marketplace / maps search links. */
  searchTerm: string;
  goals: Goal[];
  /** "all" or the engine types this genuinely applies to. */
  engines: EngineType[] | "all";
  /** If set, only these body types. Omit for any body. */
  bodyTypes?: Exclude<BodyType, "unknown">[];
  /** If set, this is a model-specific option for these catalogue ids. */
  carIds?: string[];
  costMin: number;
  costMax: number;
  /** 1–5, higher = better benefit for the money. Drives ranking. */
  valueScore: number;
  benefit: string;
  fitment: Fitment;
  risks: string[];
  /** Base sentence for the "Can this build take it?" check. */
  buildCheck: string;
};

/** Legal note shown under the installer button for colour-change options. */
export const COLOUR_CHANGE_NOTE =
  "A permanent colour change may need to be updated on the RC at the RTO, and your insurer should be informed.";

const WARRANTY_RISK =
  "May affect the manufacturer's warranty on the related parts — ask the dealer before fitting.";
const INSURANCE_RISK =
  "Tell your insurer: undeclared modifications can be used to reject a claim.";
const RTO_EXHAUST_RISK =
  "RTO legality (India): exhausts louder than the stock limit / without the approved silencer are illegal under the Motor Vehicles Act and can fail Pollution Under Control checks and draw fines.";
const RTO_ENGINE_RISK =
  "RTO legality (India): engine and ECU changes are not endorsed on the RC and are technically illegal for road use unless approved — enforcement varies, so treat this as a real risk, not a formality.";
const RTO_LOOKS_RISK =
  "RTO legality (India): body colour changes must be endorsed on the RC, and non-standard lighting can fail inspection.";

export const UPGRADES: UpgradeOption[] = [
  // ---- More power -------------------------------------------------------
  {
    id: "panel-filter",
    installer: { trade: "General mechanic", mapsQuery: "car mechanic", note: "Often a DIY fit — a mechanic can do it in minutes if you prefer." },
    name: "Performance panel air filter",
    searchTerm: "performance air filter",
    goals: ["power"],
    engines: "all",
    costMin: 3_500,
    costMax: 8_000,
    valueScore: 5,
    benefit:
      "Slightly freer breathing and sharper throttle response. On its own the power gain is small (a few percent at most) — think of it as supporting the next steps, not a power upgrade by itself.",
    fitment: "diy",
    risks: [WARRANTY_RISK],
    buildCheck:
      "Almost any healthy engine can take this — it changes airflow only slightly. Make sure it is the correct size for your airbox.",
  },
  {
    id: "cold-air-intake",
    installer: { trade: "Performance tuner", mapsQuery: "performance car tuning" },
    name: "Cold-air / performance intake kit",
    searchTerm: "cold air intake kit",
    goals: ["power"],
    engines: "all",
    costMin: 9_000,
    costMax: 18_000,
    valueScore: 4,
    benefit:
      "A small gain in response and intake sound. On a naturally aspirated engine expect mild gains only — single-digit horsepower, not a transformation.",
    fitment: "mechanic",
    risks: [
      WARRANTY_RISK,
      "A poorly placed intake can suck in water in deep monsoon waterlogging — ask where the filter will sit.",
    ],
    buildCheck:
      "Check there is physical room in the engine bay and that the kit is made (or adaptable) for your model, not a universal pipe bent to fit.",
  },
  {
    id: "throttle-controller",
    installer: { trade: "Car audio and accessories shop", mapsQuery: "car accessories shop" },
    name: "Throttle response controller",
    searchTerm: "throttle controller",
    goals: ["power"],
    engines: "all",
    costMin: 8_000,
    costMax: 16_000,
    valueScore: 3,
    benefit:
      "Makes the accelerator feel sharper by changing the throttle map. It adds no actual power — the car just responds earlier in the pedal travel.",
    fitment: "diy",
    risks: [WARRANTY_RISK, INSURANCE_RISK],
    buildCheck:
      "Only works on drive-by-wire (electronic throttle) cars, which covers most cars from the last ~15 years. It must be the version wired for your model's pedal sensor.",
  },
  {
    id: "iridium-plugs",
    installer: { trade: "General mechanic", mapsQuery: "car mechanic" },
    name: "Iridium spark plugs + ignition refresh",
    searchTerm: "iridium spark plugs",
    goals: ["power"],
    engines: ["petrol_na", "petrol_turbo"],
    costMin: 4_000,
    costMax: 9_000,
    valueScore: 4,
    benefit:
      "Restores lost smoothness and response on petrol cars whose plugs are old. This recovers power the car already had rather than adding new power.",
    fitment: "mechanic",
    risks: ["Very low risk — use the exact plug heat range specified for your engine."],
    buildCheck:
      "Any petrol engine can take this if the plugs are due. On a high-mileage car, ask the mechanic to check the ignition coils at the same time.",
  },
  {
    id: "na-ecu-tune",
    installer: { trade: "Performance tuner", mapsQuery: "ECU remap tuning", note: "Ask for a conservative tune and a before/after dyno sheet." },
    name: "Mild ECU recalibration (naturally aspirated)",
    searchTerm: "ECU remap tuning",
    goals: ["power"],
    engines: ["petrol_na"],
    costMin: 20_000,
    costMax: 35_000,
    valueScore: 3,
    benefit:
      "Mild gains only on a naturally aspirated engine — realistically around 5–8% with smoother delivery, because there is no turbo to turn up. Anyone promising large gains from an NA tune is overselling.",
    fitment: "shop",
    risks: [WARRANTY_RISK, INSURANCE_RISK, RTO_ENGINE_RISK],
    buildCheck:
      "The engine and clutch must be healthy first: a tune cannot fix worn parts, and it will find weak ones. Ask for a before/after dyno sheet or a conservative road tune.",
  },
  {
    id: "turbo-stage1-remap",
    installer: { trade: "Performance tuner", mapsQuery: "ECU remap tuning", note: "Ask for a conservative tune and a before/after dyno sheet." },
    name: "Stage 1 ECU remap (turbo petrol)",
    searchTerm: "stage 1 ECU remap",
    goals: ["power"],
    engines: ["petrol_turbo"],
    costMin: 25_000,
    costMax: 45_000,
    valueScore: 5,
    benefit:
      "The best value power upgrade on a turbo engine — typically 15–25% more power and torque from software alone, because the turbo can safely run a little more boost on a conservative tune.",
    fitment: "shop",
    risks: [WARRANTY_RISK, INSURANCE_RISK, RTO_ENGINE_RISK],
    buildCheck:
      "A turbo engine benefits most from a tune, but first confirm the clutch can take the extra torque (an uprated, supercharged-ready-spec clutch if yours is worn) and that the cooling system — radiator, hoses, coolant, intercooler pipes — is healthy. Extra boost is extra heat.",
  },
  {
    id: "diesel-stage1-remap",
    installer: { trade: "Performance tuner", mapsQuery: "diesel ECU remap tuning", note: "Ask for a conservative tune — never a DPF/EGR delete." },
    name: "Stage 1 ECU remap (diesel)",
    searchTerm: "diesel ECU remap tuning",
    goals: ["power"],
    engines: ["diesel"],
    costMin: 25_000,
    costMax: 45_000,
    valueScore: 5,
    benefit:
      "Strong torque gains (often 20–30%) that suit diesel driving. The trade-off is heat and drivetrain wear, so a conservative tune matters more than the headline number.",
    fitment: "shop",
    risks: [
      WARRANTY_RISK,
      INSURANCE_RISK,
      RTO_ENGINE_RISK,
      "Diesel remaps raise exhaust heat and clutch wear — budget for a clutch sooner than stock, and never remove the DPF/EGR: that is illegal and will fail emission checks.",
    ],
    buildCheck:
      "Check clutch wear, cooling and the DPF/EGR health before remapping. If the clutch already slips or the car runs hot, fix that first — a remap makes both worse.",
  },
  {
    id: "intercooler-upgrade",
    installer: { trade: "Performance tuner", mapsQuery: "performance car workshop" },
    name: "Upgraded intercooler",
    searchTerm: "intercooler upgrade",
    goals: ["power"],
    engines: ["petrol_turbo", "diesel"],
    costMin: 32_000,
    costMax: 65_000,
    valueScore: 4,
    benefit:
      "Cooler intake air means the engine keeps its power on hot Indian afternoons and repeated runs instead of heat-soaking. It supports a remap rather than replacing one.",
    fitment: "shop",
    risks: [WARRANTY_RISK, INSURANCE_RISK],
    buildCheck:
      "Needs bumper-off fitting and correct pipework for your model. Worth it mainly with (or before) a remap — on a stock tune the gain is mostly consistency, not peak power.",
  },
  // ---- Exhaust ----------------------------------------------------------
  {
    id: "catback-exhaust",
    installer: { trade: "Exhaust workshop", mapsQuery: "car exhaust workshop" },
    name: "Cat-back exhaust system",
    searchTerm: "cat back exhaust system",
    goals: ["exhaust", "power"],
    engines: "all",
    costMin: 25_000,
    costMax: 55_000,
    valueScore: 3,
    benefit:
      "A deeper exhaust note and a small power gain from freer flow. On a naturally aspirated engine the power gain is mild — buy this mainly for sound, with power as a bonus.",
    fitment: "shop",
    risks: [WARRANTY_RISK, INSURANCE_RISK, RTO_EXHAUST_RISK],
    buildCheck:
      "Must be fabricated or bolted for your exact model — a badly routed system rattles and drones. Keep the catalytic converter; removing it is illegal and fails emission checks.",
  },
  {
    id: "axle-back-muffler",
    installer: { trade: "Exhaust workshop", mapsQuery: "car exhaust muffler shop" },
    name: "Axle-back / rear muffler upgrade",
    searchTerm: "performance muffler exhaust",
    goals: ["exhaust"],
    engines: "all",
    costMin: 12_000,
    costMax: 25_000,
    valueScore: 4,
    benefit:
      "Most of the sound change of a full system for much less money, with little to no power change. The honest, reversible first step in exhausts.",
    fitment: "mechanic",
    risks: [WARRANTY_RISK, RTO_EXHAUST_RISK],
    buildCheck:
      "Simple bolt/weld-on part for most cars. Ask to hear the same muffler on a similar engine first — drone at highway speed is the common regret.",
  },
  {
    id: "valvetronic-muffler",
    installer: { trade: "Exhaust workshop", mapsQuery: "valvetronic exhaust installer", note: "Hear the valve open and closed before you pay." },
    name: "Valvetronic (remote-valve) muffler",
    searchTerm: "valvetronic muffler",
    goals: ["exhaust"],
    engines: "all",
    costMin: 35_000,
    costMax: 75_000,
    valueScore: 3,
    benefit:
      "Loud when you want it, near-stock quiet with the valve closed — useful if the car is also the family car. No meaningful power gain over a good axle-back.",
    fitment: "shop",
    risks: [WARRANTY_RISK, INSURANCE_RISK, RTO_EXHAUST_RISK],
    buildCheck:
      "Needs wiring for the valve and a tidy install. Even with a valve, the open setting can still be illegal on public roads — keep it closed in the city.",
  },
  {
    id: "exhaust-tip",
    installer: { trade: "Car audio and accessories shop", mapsQuery: "car accessories shop" },
    name: "Exhaust tip / finisher",
    searchTerm: "exhaust tip",
    goals: ["exhaust", "looks"],
    engines: "all",
    costMin: 2_000,
    costMax: 6_000,
    valueScore: 2,
    benefit: "Looks only — finishes the rear of the car. No sound or power change at all.",
    fitment: "diy",
    risks: ["Very low risk. Make sure it cannot work loose and fall off."],
    buildCheck: "Measure your tailpipe diameter first; tips are sold by inlet size.",
  },
  // ---- Suspension and handling -------------------------------------------
  {
    id: "suspension-refresh",
    installer: { trade: "Suspension specialist", mapsQuery: "car suspension repair" },
    name: "Suspension refresh (dampers, bushes, mounts)",
    searchTerm: "shock absorbers suspension kit",
    goals: ["suspension"],
    engines: "all",
    costMin: 20_000,
    costMax: 48_000,
    valueScore: 5,
    benefit:
      "On an older car this is the biggest handling upgrade of all: worn dampers and bushes are replaced, so the car stops floating and crashing over bumps. It restores the handling the car was designed with.",
    fitment: "mechanic",
    risks: ["Low risk — this is maintenance with standard parts. Insist on a wheel alignment afterwards."],
    buildCheck:
      "Suitable for any car, and the first thing an older car should get before power or lowering. Ask for the old parts back so you can see what was actually worn.",
  },
  {
    id: "strut-brace",
    installer: { trade: "Suspension specialist", mapsQuery: "car suspension specialist" },
    name: "Front strut brace",
    searchTerm: "strut brace bar",
    goals: ["suspension"],
    engines: "all",
    costMin: 6_000,
    costMax: 14_000,
    valueScore: 4,
    benefit:
      "Slightly sharper steering feel by stiffening the front suspension towers. A modest, honest improvement — not a transformation.",
    fitment: "diy",
    risks: ["Very low risk. Must be the brace made for your model's engine bay."],
    buildCheck: "Check bonnet clearance and that the brace clears the brake fluid reservoir and battery.",
  },
  {
    id: "rear-sway-bar",
    installer: { trade: "Suspension specialist", mapsQuery: "car suspension specialist" },
    name: "Stiffer rear anti-roll (sway) bar",
    searchTerm: "anti roll sway bar",
    goals: ["suspension"],
    engines: "all",
    costMin: 12_000,
    costMax: 25_000,
    valueScore: 4,
    benefit:
      "Noticeably flatter cornering and less understeer, especially on front-wheel-drive sedans. One of the best-value handling changes.",
    fitment: "mechanic",
    risks: [WARRANTY_RISK, "Too stiff a rear bar can make the car twitchy in the wet — stay with a mild, model-specific bar."],
    buildCheck: "Availability is model-specific; if no bar exists for your car, do not let a shop weld up a universal one.",
  },
  {
    id: "lowering-springs",
    installer: { trade: "Suspension specialist", mapsQuery: "car lowering springs installer", note: "Wheel alignment afterwards is part of the job." },
    name: "Lowering springs",
    searchTerm: "lowering springs kit",
    goals: ["suspension", "looks"],
    engines: "all",
    bodyTypes: ["sedan", "hatchback"],
    costMin: 18_000,
    costMax: 35_000,
    valueScore: 3,
    benefit:
      "Flatter handling and a lower stance. The trade-off in India is real: less ground clearance on speed breakers and steep ramps.",
    fitment: "shop",
    risks: [
      WARRANTY_RISK,
      "Lowered cars scrape on Indian roads and can struggle with flooded streets in monsoon. Wheel alignment is mandatory after fitting.",
    ],
    buildCheck:
      "Only fit springs designed for your model and engine weight. On an older car, worn dampers must be replaced at the same time or the ride becomes bouncy.",
  },
  {
    id: "coilovers",
    installer: { trade: "Suspension specialist", mapsQuery: "coilover suspension installer", note: "Corner setup and alignment should be included in the quote." },
    name: "Adjustable coilover suspension",
    searchTerm: "coilover suspension kit",
    goals: ["suspension"],
    engines: "all",
    costMin: 45_000,
    costMax: 95_000,
    valueScore: 4,
    benefit:
      "The complete handling package: adjustable height and damping, much flatter cornering. Overkill for pure city use, right for enthusiastic driving.",
    fitment: "shop",
    risks: [
      WARRANTY_RISK,
      INSURANCE_RISK,
      "Cheap no-name coilovers ride harshly and wear out fast — the budget end of this range is where regret lives. Alignment and corner setup are part of the job, not extras.",
    ],
    buildCheck:
      "Confirm the kit exists for your exact model and that the shop can align the car afterwards. Budget for alignment on top of the kit price.",
  },
  // ---- Brakes -------------------------------------------------------------
  {
    id: "performance-pads",
    installer: { trade: "Brake specialist", mapsQuery: "car brake repair" },
    name: "Performance brake pads",
    searchTerm: "performance brake pads",
    goals: ["brakes"],
    engines: "all",
    costMin: 5_000,
    costMax: 12_000,
    valueScore: 5,
    benefit:
      "Better bite and much better resistance to fade on long descents, for the least money of any brake upgrade. The best first brake step for almost every car.",
    fitment: "mechanic",
    risks: ["Low risk. Some performance pads dust more and can squeal when cold — normal, not a defect."],
    buildCheck: "Any car can take these if the discs are healthy. If the discs are scored or thin, replace them at the same time.",
  },
  {
    id: "braided-lines-fluid",
    installer: { trade: "Brake specialist", mapsQuery: "car brake repair", note: "Brakes are safety-critical — fitting and bleeding must be done by a mechanic." },
    name: "Braided brake lines + fresh high-temp fluid",
    searchTerm: "braided brake lines",
    goals: ["brakes"],
    engines: "all",
    costMin: 6_000,
    costMax: 14_000,
    valueScore: 4,
    benefit:
      "A firmer, more consistent pedal — rubber lines expand with age and heat, steel-braided ones do not. Especially noticeable on older cars.",
    fitment: "mechanic",
    risks: ["Brakes are safety-critical: this must be fitted and bled by a mechanic, never a first DIY job."],
    buildCheck:
      "On an older car this doubles as maintenance — old rubber hoses are a failure risk anyway. Lines must be the correct length and fittings for your model.",
  },
  {
    id: "slotted-rotors-pads",
    installer: { trade: "Brake specialist", mapsQuery: "car brake repair" },
    name: "Slotted/drilled rotors with performance pads",
    searchTerm: "slotted brake rotors disc",
    goals: ["brakes"],
    engines: "all",
    costMin: 15_000,
    costMax: 32_000,
    valueScore: 4,
    benefit:
      "Stronger, more fade-resistant braking than pads alone, and it refreshes worn discs at the same time. A sensible middle step before any big brake kit.",
    fitment: "mechanic",
    risks: [WARRANTY_RISK, "Avoid the cheapest drilled rotors — poor-quality drilled discs can crack. Slotted-only is the safer budget choice."],
    buildCheck: "Rotors must match your car's exact disc size and hub. Bed the new pads in gently for the first few hundred kilometres.",
  },
  {
    id: "big-brake-kit",
    installer: { trade: "Brake specialist", mapsQuery: "big brake kit installer", note: "Ask them to confirm wheel-to-caliper clearance before ordering." },
    name: "Big brake kit (larger discs + multi-piston calipers)",
    searchTerm: "big brake kit",
    goals: ["brakes"],
    engines: "all",
    costMin: 60_000,
    costMax: 120_000,
    valueScore: 3,
    benefit:
      "Serious, fade-proof stopping power for fast or heavily modified cars. For a stock-power daily driver it is mostly looks — pads and rotors above give most of the real-world benefit for far less.",
    fitment: "shop",
    risks: [
      WARRANTY_RISK,
      INSURANCE_RISK,
      "May not fit inside your current wheels — wheel clearance must be measured before ordering, which can force a wheel change too.",
    ],
    buildCheck:
      "Check caliper-to-wheel clearance first, and that spare/replacement pads for the kit are actually available in India before buying.",
  },
  // ---- Wheels and tyres ---------------------------------------------------
  {
    id: "premium-tyres",
    installer: { trade: "Tyre and alloy wheel shop", mapsQuery: "tyre shop", note: "Check the manufacturing date on the tyre sidewall — avoid old stock." },
    name: "Premium tyres in the stock size",
    searchTerm: "car tyres",
    goals: ["wheels"],
    engines: "all",
    costMin: 20_000,
    costMax: 42_000,
    valueScore: 5,
    benefit:
      "The single biggest real-world upgrade on this list: better grip in the wet, shorter braking and less road noise, with low legality or fitment risk because the size stays stock.",
    fitment: "shop",
    risks: ["Low risk. Buy from an authorised dealer so the manufacturing date is fresh — avoid old stock."],
    buildCheck:
      "Any car can take these. Match the stock size and load/speed rating on your current tyre sidewall, and get alignment and balancing done at fitting.",
  },
  {
    id: "performance-tyres",
    installer: { trade: "Tyre and alloy wheel shop", mapsQuery: "performance tyres shop" },
    name: "Sport / performance tyres (mild upsize)",
    searchTerm: "performance sports car tyres",
    goals: ["wheels"],
    engines: "all",
    costMin: 26_000,
    costMax: 52_000,
    valueScore: 5,
    benefit:
      "Noticeably more cornering grip and steering response. Trade-offs: a firmer ride, more noise, and faster wear than touring tyres.",
    fitment: "shop",
    risks: [
      WARRANTY_RISK,
      "A big upsize can rub, throw the speedometer off and hurt fuel economy. Stay within ~3% of the stock overall diameter.",
    ],
    buildCheck:
      "The shop must confirm the new size clears the arches at full steering lock and full suspension compression, and matches the load rating for the car's weight.",
  },
  {
    id: "alloy-wheels",
    installer: { trade: "Tyre and alloy wheel shop", mapsQuery: "alloy wheel fitting", note: "Ask for PCD, offset and load-rating in writing." },
    name: "Alloy wheel set",
    searchTerm: "alloy wheels",
    goals: ["wheels", "looks"],
    engines: "all",
    costMin: 28_000,
    costMax: 60_000,
    valueScore: 4,
    benefit:
      "Mostly looks, with a small handling benefit if the new wheels are lighter than stock. Cheap heavy alloys are a downgrade dressed as an upgrade.",
    fitment: "shop",
    risks: [
      WARRANTY_RISK,
      INSURANCE_RISK,
      "Wrong offset or weak wheels are a safety issue on Indian potholes — buy load-rated wheels from a known brand, not the cheapest set in the market.",
    ],
    buildCheck:
      "PCD, centre bore, offset and load rating must all match your car — 'it bolts on' is not enough. Confirm your existing tyres fit the new rim width, or budget for tyres too.",
  },
  {
    id: "lightweight-wheels-tyres",
    installer: { trade: "Tyre and alloy wheel shop", mapsQuery: "alloy wheel fitting", note: "Ask for the actual weight per wheel, not just 'lightweight'." },
    name: "Lightweight wheels + performance tyres (package)",
    searchTerm: "lightweight alloy wheels tyres",
    goals: ["wheels"],
    engines: "all",
    costMin: 55_000,
    costMax: 95_000,
    valueScore: 4,
    benefit:
      "Lighter wheels improve acceleration feel, braking and ride over bumps all at once, and the tyres add the grip. The complete wheel upgrade, priced as one.",
    fitment: "shop",
    risks: [WARRANTY_RISK, INSURANCE_RISK],
    buildCheck:
      "Same fitment checks as any wheel change (PCD, offset, load rating) — plus ask the actual weight per wheel; 'lightweight' should be a number, not an adjective.",
  },
  // ---- Looks and lighting --------------------------------------------------
  {
    id: "led-headlamp-bulbs",
    installer: { trade: "Car audio and accessories shop", mapsQuery: "car accessories shop", note: "Get the beam aligned after fitting." },
    name: "LED headlamp bulb upgrade",
    searchTerm: "LED headlight bulbs car",
    goals: ["looks"],
    engines: "all",
    costMin: 4_000,
    costMax: 12_000,
    valueScore: 3,
    benefit:
      "Brighter, whiter light where the housing suits LED bulbs — projector housings usually work well; old reflector housings often scatter the beam and dazzle others.",
    fitment: "mechanic",
    risks: [
      RTO_LOOKS_RISK,
      "Non-approved lighting can be fined and will blind oncoming traffic if the beam pattern is wrong — get the beam aligned after fitting.",
    ],
    buildCheck:
      "First identify whether your car has projector or reflector housings. If reflector, a quality halogen upgrade is often the better, legal answer.",
  },
  {
    id: "aux-fog-drl",
    installer: { trade: "Car audio and accessories shop", mapsQuery: "car fog lamp fitting", note: "Must be wired through a relay and switch." },
    name: "Auxiliary fog lamps / DRL upgrade",
    searchTerm: "car fog lamps LED DRL",
    goals: ["looks"],
    engines: "all",
    costMin: 5_000,
    costMax: 15_000,
    valueScore: 3,
    benefit:
      "Useful extra light low on the road in fog and rain, and a fresher front look. Auxiliary lamps supplement headlamps — they do not replace them.",
    fitment: "mechanic",
    risks: [RTO_LOOKS_RISK, "Must be wired through a relay and switch, not tapped into random wiring — poor wiring is a fire risk."],
    buildCheck: "Check bumper mounting points for your model and that the lamps are aimed low so they help rather than dazzle.",
  },
  {
    id: "roof-wrap",
    installer: { trade: "Wrap and PPF studio", mapsQuery: "car wrap studio", note: "Ask which film brand is used and what warranty covers the work." },
    name: "Gloss-black roof wrap",
    searchTerm: "car roof wrap vinyl",
    goals: ["looks"],
    engines: "all",
    costMin: 8_000,
    costMax: 18_000,
    valueScore: 3,
    benefit:
      "The two-tone look for a fraction of paint cost, and it peels off when you sell the car. Quality of the film and the installer matters more than the brand name.",
    fitment: "shop",
    risks: [RTO_LOOKS_RISK, "Cheap film fades and lifts at the edges within a couple of Indian summers — ask what film and what warranty on the work."],
    buildCheck: "Any car can take this. The roof must be properly cleaned and any roof-rail/antenna fittings removed and refitted, not wrapped around.",
  },
  {
    id: "boot-lip-spoiler",
    installer: { trade: "Spoiler and body kit fitter", mapsQuery: "car spoiler fitting" },
    name: "Boot-lip spoiler",
    searchTerm: "car boot lip spoiler",
    goals: ["looks"],
    engines: "all",
    bodyTypes: ["sedan", "hatchback", "suv"],
    costMin: 6_000,
    costMax: 16_000,
    valueScore: 3,
    benefit:
      "Looks only at road speeds — a subtle lip finishes the rear of a sedan nicely. It will not add meaningful downforce; buy it because you like how it looks.",
    fitment: "mechanic",
    risks: ["Low risk. Prefer the version made for your model's boot shape over a universal strip."],
    buildCheck: "Confirm it is shaped for your boot lid. Drilling versus tape-only fitting is worth asking about before it goes on.",
  },
  {
    id: "ceramic-detailing",
    installer: { trade: "Car detailing studio", mapsQuery: "car detailing studio", note: "Ask what product is used and how many years it is rated for." },
    name: "Paint correction + ceramic coating",
    searchTerm: "ceramic coating car detailing",
    goals: ["looks"],
    engines: "all",
    costMin: 15_000,
    costMax: 35_000,
    valueScore: 3,
    benefit:
      "Removes swirls and light scratches, then protects the paint so the car stays glossy and easier to wash. On an older car the transformation is often bigger than any bolt-on part.",
    fitment: "shop",
    risks: ["Low risk. Very cheap 'ceramic' offers are often just wax — ask what product is used and how many years it is rated for."],
    buildCheck:
      "Any car can take this, but deep scratches and dents need paint work first — a coating makes paint shinier, it does not repair it.",
  },
  {
    id: "full-wrap",
    installer: { trade: "Wrap and PPF studio", mapsQuery: "car wrap studio", note: "Inspect the shop's previous work in person before booking." },
    colourChange: true,
    name: "Full body colour wrap",
    searchTerm: "car vinyl wrap full body",
    goals: ["looks"],
    engines: "all",
    costMin: 60_000,
    costMax: 110_000,
    valueScore: 2,
    benefit:
      "A completely new colour that protects the original paint and can be removed later. Expensive, and the result is entirely down to film quality and installer skill.",
    fitment: "shop",
    risks: [
      RTO_LOOKS_RISK,
      INSURANCE_RISK,
      "A colour change must be endorsed on the RC. Panel gaps and edges show on cheap installs — inspect the shop's previous work in person.",
    ],
    buildCheck:
      "Any car can be wrapped, but tired paint and rust must be fixed first or the film lifts. Ask how edges and door jambs are handled.",
  },
];

/** Coarse body-type guesses for cars that are not in the catalogue, so the
 *  generic fallback can still prefer body-appropriate options. Unknown
 *  models return "unknown" and simply get body-agnostic options. */
const BODY_HINTS: { bodyType: Exclude<BodyType, "unknown">; keywords: string[] }[] = [
  { bodyType: "suv", keywords: ["creta", "seltos", "nexon", "brezza", "xuv", "scorpio", "fortuner", "innova", "harrier", "safari", "venue", "sonet", "punch", "thar", "compass", "hector", "elevate", "taigun", "kushaq"] },
  { bodyType: "hatchback", keywords: ["swift", "baleno", "i20", "polo", "altroz", "tiago", "kwid", "wagon r", "wagonr", "ignis", "jazz", "freestyle", "micra", "figo", "santro", "i10", "glanza"] },
  { bodyType: "sedan", keywords: ["city", "verna", "ciaz", "amaze", "aura", "dzire", "virtus", "slavia", "camry", "superb", "octavia", "corolla", "civic", "elantra"] },
];

export function guessBodyType(model: string): BodyType {
  const m = model.toLowerCase();
  for (const hint of BODY_HINTS) {
    if (hint.keywords.some((k) => m.includes(k.trim()))) return hint.bodyType;
  }
  return "unknown";
}
