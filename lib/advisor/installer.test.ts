import { describe, expect, it } from "vitest";
import { COLOUR_CHANGE_NOTE, UPGRADES } from "./data";
import { buildInstallerLink, recommend } from "./recommend";

describe("installer data on every upgrade option", () => {
  it("every option has an installer with non-empty trade and mapsQuery", () => {
    expect(UPGRADES.length).toBeGreaterThan(0);
    for (const o of UPGRADES) {
      expect(o.installer, o.id).toBeDefined();
      expect(o.installer.trade.trim().length, o.id).toBeGreaterThan(0);
      expect(o.installer.mapsQuery.trim().length, o.id).toBeGreaterThan(0);
      if (o.installer.note !== undefined) {
        expect(o.installer.note.trim().length, o.id).toBeGreaterThan(0);
      }
    }
  });

  it("installer trades are plausible fitting trades, never business names", () => {
    // Trades describe a kind of workshop; a hard-coded business would
    // contain digits (phone/address) or a brand-y proper name pattern.
    for (const o of UPGRADES) {
      expect(o.installer.trade, o.id).not.toMatch(/\d/);
      expect(o.installer.mapsQuery, o.id).not.toMatch(/\d{3,}/);
    }
  });
});

describe("buildInstallerLink — generated Maps search URLs only", () => {
  it("builds a valid, encoded Google Maps search URL for every option", () => {
    for (const o of UPGRADES) {
      const href = buildInstallerLink(o.installer.mapsQuery);
      const url = new URL(href); // throws if invalid
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("www.google.com");
      expect(url.pathname).toBe("/maps/search/");
      expect(url.searchParams.get("api")).toBe("1");
      expect(url.searchParams.get("query")).toBe(`${o.installer.mapsQuery} near me`);
      // Fully encoded: no raw spaces or unencoded query text in the href.
      expect(href).toBe(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.installer.mapsQuery} near me`)}`
      );
      expect(href).not.toContain(" ");
    }
  });

  it("encodes special characters in the query", () => {
    const href = buildInstallerLink("tyre & wheel shop + fitting");
    expect(href).not.toContain("&wheel");
    expect(new URL(href).searchParams.get("query")).toBe("tyre & wheel shop + fitting near me");
  });

  it("boot-lip spoiler uses the spoiler/body-kit fitter trade", () => {
    const spoiler = UPGRADES.find((o) => o.id === "boot-lip-spoiler");
    expect(spoiler).toBeDefined();
    expect(spoiler!.installer.trade).toBe("Spoiler and body kit fitter");
    expect(spoiler!.installer.mapsQuery).toBe("car spoiler fitting");
    expect(buildInstallerLink(spoiler!.installer.mapsQuery)).toBe(
      "https://www.google.com/maps/search/?api=1&query=car%20spoiler%20fitting%20near%20me"
    );
  });

  it("colour-change note applies only to whole-body colour options", () => {
    expect(COLOUR_CHANGE_NOTE).toContain("RC at the RTO");
    expect(COLOUR_CHANGE_NOTE).toContain("insurer should be informed");
    const flagged = UPGRADES.filter((o) => o.colourChange).map((o) => o.id);
    // Full wrap changes the body colour; roof wrap, spoiler, wheels,
    // ceramic coating etc. must NOT be flagged.
    expect(flagged).toEqual(["full-wrap"]);
    for (const id of ["roof-wrap", "boot-lip-spoiler", "alloy-wheels", "ceramic-detailing"]) {
      expect(UPGRADES.find((o) => o.id === id)?.colourChange, id).toBeFalsy();
    }
  });

  it("tyre wording says low (not zero) legality/fitment risk", () => {
    const tyres = UPGRADES.find((o) => o.id === "premium-tyres");
    expect(tyres?.benefit).toContain("low legality or fitment risk");
    for (const o of UPGRADES) {
      expect(o.benefit, o.id).not.toContain("zero legality");
    }
  });

  it("recommendations carry the installer through to the UI layer", () => {
    const result = recommend({
      car: { make: "Toyota", model: "Corolla Altis", year: 2018 },
      goal: "power",
      budgetMax: 100_000,
      currentYear: 2026,
    });
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const r of result.recommendations) {
      expect(r.installer.trade.trim().length).toBeGreaterThan(0);
      expect(() => new URL(buildInstallerLink(r.installer.mapsQuery))).not.toThrow();
    }
  });
});
