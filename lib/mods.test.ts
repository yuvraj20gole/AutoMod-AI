import { describe, expect, it } from "vitest";
import {
  MOD_CATEGORIES,
  canCompareEngines,
  compareEtaMinutes,
  counterpartMod,
  detailedPartKey,
  isValidMod,
  modLabel,
  visibleCategories,
  visibleOptions,
} from "./mods";

const spoiler = MOD_CATEGORIES.find((c) => c.key === "spoiler")!;

describe("spoiler option labels", () => {
  it("visible Studio labels are distinct and honest about the lip render", () => {
    const labels = visibleOptions(spoiler, "fast").map((o) => o.label);
    expect(labels).toEqual(["Lip spoiler", "Ducktail spoiler"]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.join(" ")).not.toMatch(/wing/i);
  });

  it("no visible category has duplicate labels (Fast)", () => {
    for (const cat of MOD_CATEGORIES) {
      const labels = visibleOptions(cat, "fast").map((o) => o.label);
      expect(new Set(labels).size, cat.key).toBe(labels.length);
    }
  });

  it("the Fast-hidden gt_wing stays valid; Detailed exposes a real GT wing", () => {
    const gtWing = spoiler.options.find((o) => o.key === "gt_wing");
    expect(gtWing?.engines).toContain("detailed");
    expect(visibleOptions(spoiler, "fast").some((o) => o.key === "gt_wing")).toBe(false);
    expect(visibleOptions(spoiler, "detailed").some((o) => o.key === "gt_wing")).toBe(true);
    expect(isValidMod("spoiler", "gt_wing")).toBe(true);
    expect(modLabel("spoiler", "gt_wing")).toBe("Spoiler: GT wing");
  });

  it("all engine spoiler ids keep a distinct-by-id sensible label (My Builds)", () => {
    expect(modLabel("spoiler", "roof_spoiler")).toBe("Spoiler: Lip spoiler");
    expect(modLabel("spoiler", "ducktail")).toBe("Spoiler: Ducktail spoiler");
    expect(modLabel("spoiler", "lip_spoiler")).toBe("Spoiler: Lip spoiler");
    expect(isValidMod("spoiler", "roof_spoiler")).toBe(true);
    expect(isValidMod("spoiler", "ducktail")).toBe(true);
    expect(isValidMod("spoiler", "huge_wing")).toBe(false);
  });
});

describe("engine-aware visibleOptions", () => {
  it("Fast never lists Detailed-only body-kit parts", () => {
    const keys = visibleCategories("fast").flatMap((c) =>
      visibleOptions(c, "fast").map((o) => `${c.key}:${o.key}`)
    );
    expect(keys.some((k) => k.startsWith("body:"))).toBe(false);
    expect(keys).not.toContain("spoiler:lip_spoiler");
    expect(keys).not.toContain("spoiler:gt_wing");
  });

  it("Detailed lists locked spoilers, body kit, and Fast parity options", () => {
    const keys = visibleCategories("detailed").flatMap((c) =>
      visibleOptions(c, "detailed").map((o) => `${c.key}:${o.key}`)
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "spoiler:lip_spoiler",
        "spoiler:ducktail",
        "spoiler:gt_wing",
        "body:side_skirts",
        "body:front_lip",
        "body:rear_diffuser",
        "wheels:bronze",
        "wheels:gold",
        "hood:carbon_fibre",
        "hood:matte_black",
        "wrap:matte_black",
        "wrap:satin_blue",
        "paint:candy_red",
        "paint:gloss_black",
      ])
    );
    expect(keys).not.toContain("spoiler:roof_spoiler");
  });

  it("marks newly ported Detailed options as experimental", () => {
    const paint = MOD_CATEGORIES.find((c) => c.key === "paint")!;
    expect(visibleOptions(paint, "detailed").every((o) => o.experimental)).toBe(true);
    const wrap = MOD_CATEGORIES.find((c) => c.key === "wrap")!;
    expect(wrap.options.find((o) => o.key === "matte_black")?.experimental).toBeFalsy();
    expect(wrap.options.find((o) => o.key === "satin_blue")?.experimental).toBe(true);
  });

  it("maps Detailed options to Qwen part keys", () => {
    expect(detailedPartKey("spoiler", "gt_wing")).toBe("gt_wing");
    expect(detailedPartKey("body", "side_skirts")).toBe("side_skirts");
    expect(detailedPartKey("wheels", "bronze")).toBe("wheels_bronze");
    expect(detailedPartKey("wheels", "gold")).toBe("wheels_gold");
    expect(detailedPartKey("body", "front_bumper_finish")).toBe("front_bumper_finish");
    expect(detailedPartKey("body", "rear_bumper_finish")).toBe("rear_bumper_finish");
    expect(detailedPartKey("paint", "candy_red")).toBe("paint_candy_red");
    expect(detailedPartKey("hood", "matte_black")).toBe("hood_matte_black");
  });

  it("lists provisional bumper finishes on Detailed only", () => {
    const body = MOD_CATEGORIES.find((c) => c.key === "body")!;
    const keys = visibleOptions(body, "detailed").map((o) => o.key);
    expect(keys).toEqual(
      expect.arrayContaining(["front_bumper_finish", "rear_bumper_finish"])
    );
    expect(visibleOptions(body, "fast")).toHaveLength(0);
  });
});

describe("compare engines availability", () => {
  it("allows compare only for shared conceptual parts", () => {
    expect(canCompareEngines("spoiler", "ducktail")).toBe(true);
    expect(canCompareEngines("spoiler", "roof_spoiler")).toBe(true);
    expect(canCompareEngines("spoiler", "lip_spoiler")).toBe(true);
    expect(canCompareEngines("wrap", "matte_black")).toBe(true);
    expect(canCompareEngines("wheels", "bronze")).toBe(true);
    expect(canCompareEngines("hood", "carbon_fibre")).toBe(true);
    expect(canCompareEngines("spoiler", "gt_wing")).toBe(false);
    expect(canCompareEngines("body", "side_skirts")).toBe(false);
    expect(canCompareEngines("paint", "candy_red")).toBe(true);
    expect(canCompareEngines("wheels", "gold")).toBe(true);
  });

  it("maps lip spoiler ids across engines", () => {
    expect(counterpartMod("spoiler", "roof_spoiler", "detailed")).toEqual({
      category: "spoiler",
      option: "lip_spoiler",
    });
    expect(counterpartMod("spoiler", "lip_spoiler", "fast")).toEqual({
      category: "spoiler",
      option: "roof_spoiler",
    });
    expect(counterpartMod("spoiler", "gt_wing", "fast")).toBeNull();
  });

  it("states ETA for the other engine", () => {
    expect(compareEtaMinutes("fast").minutes).toBe(4);
    expect(compareEtaMinutes("detailed").minutes).toBe(2);
  });
});
