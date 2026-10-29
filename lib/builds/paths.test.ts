import { describe, expect, it } from "vitest";
import {
  deletableBuildStoragePaths,
  isOwnedBuildResultPath,
  ownedBuildStoragePaths,
} from "./paths";

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

describe("deletableBuildStoragePaths", () => {
  const uid = "user-abc";
  const carOriginal = `${uid}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;
  const afterA = `${uid}/builds/11111111-1111-1111-1111-111111111111.png`;
  const afterB = `${uid}/builds/22222222-2222-2222-2222-222222222222.png`;

  it("shared path — car original used as before_image_url is never deleted", () => {
    // Build A and Build B both point before → car original; deleting A must not
    // remove the shared before, only A's exclusive after (if unused elsewhere).
    expect(
      deletableBuildStoragePaths({
        userId: uid,
        beforePath: carOriginal,
        afterPath: afterA,
        referencedByOthers: [carOriginal, afterB],
      })
    ).toEqual([afterA]);
  });

  it("shared path — when after is also referenced by another build, delete nothing", () => {
    expect(
      deletableBuildStoragePaths({
        userId: uid,
        beforePath: carOriginal,
        afterPath: afterA,
        referencedByOthers: [carOriginal, afterA],
      })
    ).toEqual([]);
  });

  it("own paths — only exclusive build result objects are deleted", () => {
    expect(
      deletableBuildStoragePaths({
        userId: uid,
        beforePath: `${uid}/builds/only-this-before.png`,
        afterPath: afterA,
        referencedByOthers: [],
      })
    ).toEqual([`${uid}/builds/only-this-before.png`, afterA]);
  });

  it("car original path — never deleted even when not listed in referencedByOthers", () => {
    expect(isOwnedBuildResultPath(uid, carOriginal)).toBe(false);
    expect(
      deletableBuildStoragePaths({
        userId: uid,
        beforePath: carOriginal,
        afterPath: null,
        referencedByOthers: [],
      })
    ).toEqual([]);
  });

  it("rejects prefix/folder-style paths and traversal", () => {
    expect(
      deletableBuildStoragePaths({
        userId: uid,
        beforePath: `${uid}/builds/`,
        afterPath: `${uid}/builds`,
        referencedByOthers: [],
      })
    ).toEqual([]);
    expect(
      deletableBuildStoragePaths({
        userId: uid,
        beforePath: `${uid}/builds/../secret.png`,
        afterPath: `${uid}/builds/nested/deep.png`,
        referencedByOthers: [],
      })
    ).toEqual([]);
  });
});
