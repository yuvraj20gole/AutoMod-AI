import { describe, expect, it } from "vitest";
import {
  EDITING_OFFLINE_MESSAGE,
  isEditingOffline,
  offlineEnginesPayload,
} from "./offline";

describe("isEditingOffline", () => {
  it("treats empty / unset engines as offline (hosted showcase)", () => {
    expect(isEditingOffline(undefined)).toBe(true);
    expect(isEditingOffline(null)).toBe(true);
    expect(isEditingOffline({})).toBe(true);
    expect(
      isEditingOffline({
        fast: { ready: false },
        detailed: { ready: false },
      })
    ).toBe(true);
  });

  it("is online when Fast or Detailed reports ready", () => {
    expect(isEditingOffline({ fast: { ready: true }, detailed: { ready: false } })).toBe(
      false
    );
    expect(isEditingOffline({ fast: { ready: false }, detailed: { ready: true } })).toBe(
      false
    );
  });

  it("offline payload uses the showcase message", () => {
    const p = offlineEnginesPayload();
    expect(p.fast.ready).toBe(false);
    expect(p.detailed.ready).toBe(false);
    expect(p.fast.reason).toBe(EDITING_OFFLINE_MESSAGE);
    expect(EDITING_OFFLINE_MESSAGE).toMatch(/Editing engines run locally/i);
  });
});
