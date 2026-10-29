/**
 * Build image paths live in the car-photos bucket as `{userId}/builds/...`.
 * Returns only paths that belong under the given user folder (RLS defense
 * in depth for storage deletes).
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
