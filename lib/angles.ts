import type { ModCategory } from "@/lib/mods";

export type PhotoAngle = "front_34" | "front" | "side" | "rear_34" | "rear";

export const ANGLES: { key: PhotoAngle; label: string; hint: string }[] = [
  { key: "front_34", label: "Front 3/4", hint: "Front corner, showing the front and one side" },
  { key: "front", label: "Front", hint: "Straight from the front" },
  { key: "side", label: "Side", hint: "Straight from the side, full car in frame" },
  { key: "rear_34", label: "Rear 3/4", hint: "Rear corner, showing the back and one side" },
  { key: "rear", label: "Rear", hint: "Straight from the back" },
];

export const ANGLE_LABEL: Record<PhotoAngle, string> = Object.fromEntries(
  ANGLES.map((a) => [a.key, a.label])
) as Record<PhotoAngle, string>;

// Best photo angle for each modification, in order of preference.
export const MOD_ANGLE_PREFERENCE: Record<ModCategory, PhotoAngle[]> = {
  paint: ["side", "front_34", "rear_34", "front", "rear"],
  wrap: ["side", "front_34", "rear_34", "front", "rear"],
  wheels: ["side", "front_34", "rear_34"],
  hood: ["front_34", "front"],
  spoiler: ["rear_34", "rear"],
  body: ["side", "front_34", "rear_34"],
};

export function pickPhotoForMod<T extends { angle: string }>(
  category: ModCategory,
  photos: T[]
): T | null {
  for (const angle of MOD_ANGLE_PREFERENCE[category]) {
    const hit = photos.find((p) => p.angle === angle);
    if (hit) return hit;
  }
  return null;
}

export function neededAnglesText(category: ModCategory): string {
  return MOD_ANGLE_PREFERENCE[category]
    .slice(0, 2)
    .map((a) => ANGLE_LABEL[a])
    .join(" or ");
}
