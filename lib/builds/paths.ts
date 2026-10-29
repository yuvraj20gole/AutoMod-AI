/**
 * Build result images live at `{userId}/builds/{uuid}.png`.
 * Car originals live at `{userId}/{uuid}.{ext}` (and in car_photos) — they are
 * shared across builds via `before_image_url` and must never be deleted with a build.
 */

/** True when the path is an exact build-output object under the user's builds folder. */
export function isOwnedBuildResultPath(userId: string, path: string): boolean {
  if (!userId || !path || typeof path !== "string") return false;
  if (path.includes("..") || path.includes("//")) return false;
  // Exact object: `{userId}/builds/{filename}` — no trailing slash / nested folders.
  const re = new RegExp(
    `^${escapeRegExp(userId)}/builds/[^/]+$`
  );
  return re.test(path);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @deprecated Prefer {@link deletableBuildStoragePaths}. Kept for call sites that
 * only need ownership filtering; does NOT exclude shared car photos.
 */
export function ownedBuildStoragePaths(
  userId: string,
  beforePath: string | null | undefined,
  afterPath: string | null | undefined
): string[] {
  const prefix = `${userId}/`;
  const out: string[] = [];
  for (const p of [beforePath, afterPath]) {
    if (!p || typeof p !== "string") continue;
    if (!p.startsWith(prefix)) continue;
    if (p.includes("..")) continue;
    out.push(p);
  }
  return out;
}

export type DeletableBuildPathsInput = {
  userId: string;
  beforePath: string | null | undefined;
  afterPath: string | null | undefined;
  /** Exact object paths still referenced by OTHER builds (before + after). */
  referencedByOthers: Iterable<string>;
};

/**
 * Exact storage object paths safe to remove when deleting one build.
 *
 * - Only `{userId}/builds/{file}` objects owned by this build.
 * - Never a car original / car-level path (anything outside `/builds/`).
 * - Never a path any other builds row still references.
 * - Never deletes by prefix or folder — returns exact object keys only.
 */
export function deletableBuildStoragePaths(input: DeletableBuildPathsInput): string[] {
  const { userId, beforePath, afterPath, referencedByOthers } = input;
  const stillUsed = new Set(
    [...referencedByOthers].filter((p): p is string => typeof p === "string" && p.length > 0)
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [beforePath, afterPath]) {
    if (!p || typeof p !== "string") continue;
    if (seen.has(p)) continue;
    seen.add(p);
    if (!isOwnedBuildResultPath(userId, p)) continue;
    if (stillUsed.has(p)) continue;
    out.push(p);
  }
  return out;
}
