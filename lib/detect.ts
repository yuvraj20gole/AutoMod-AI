import type { PhotoAngle } from "@/lib/angles";

export type DetectResult = {
  angle: PhotoAngle | null;
  candidates: { make: string; model: string; year_from: number; year_to: number | null; score: number }[];
};

export async function detectPhoto(file: File): Promise<DetectResult | { error: string }> {
  try {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch("/api/cars/identify", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? "Could not analyse the photo." };
    return { angle: data.angle ?? null, candidates: data.candidates ?? [] };
  } catch {
    return { error: "Could not reach the server." };
  }
}
