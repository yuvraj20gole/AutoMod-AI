import { describe, expect, it } from "vitest";
import { ownedBuildStoragePaths } from "./paths";

describe("ownedBuildStoragePaths", () => {
  const uid = "user-abc";

  it("keeps only paths under the user's folder", () => {
    expect(
      ownedBuildStoragePaths(
        uid,
        `${uid}/builds/before.png`,
        `${uid}/builds/after.png`
      )
    ).toEqual([`${uid}/builds/before.png`, `${uid}/builds/after.png`]);
  });

  it("drops foreign-user paths and path traversal", () => {
    expect(
      ownedBuildStoragePaths(uid, "other/builds/x.png", `${uid}/../other/x.png`)
    ).toEqual([]);
  });

  it("ignores null/empty", () => {
    expect(ownedBuildStoragePaths(uid, null, undefined)).toEqual([]);
    expect(ownedBuildStoragePaths(uid, "", `${uid}/builds/a.png`)).toEqual([
      `${uid}/builds/a.png`,
    ]);
  });
});
