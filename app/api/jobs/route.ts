import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detailedPartKey, isValidMod, type ModCategory } from "@/lib/mods";
import { pickPhotoForMod, neededAnglesText } from "@/lib/angles";
import { EDITING_OFFLINE_MESSAGE } from "@/lib/engines/offline";

export const maxDuration = 60;

/** Create a Detailed edit job (queued). Client polls GET /api/jobs/[id]. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const inferenceUrl = process.env.INFERENCE_URL;
  if (!inferenceUrl) {
    return NextResponse.json({ error: EDITING_OFFLINE_MESSAGE }, { status: 503 });
  }

  let body: { carId?: string; category?: string; option?: string; photoId?: string; engine?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const engine = body.engine ?? "detailed";
  if (engine !== "detailed") {
    return NextResponse.json({ error: "Use /api/builds/generate for Fast edits." }, { status: 400 });
  }

  const { carId, category, option, photoId } = body;
  if (!carId || !category || !option || !isValidMod(category, option, "detailed")) {
    return NextResponse.json({ error: "Invalid modification for Detailed" }, { status: 400 });
  }

  const part = detailedPartKey(category, option);
  if (!part) {
    return NextResponse.json({ error: "No Detailed prompt for that option" }, { status: 400 });
  }

  const { data: car, error: carError } = await supabase
    .from("cars")
    .select("id, photo_url")
    .eq("id", carId)
    .single();
  if (carError || !car) {
    return NextResponse.json({ error: "Car not found" }, { status: 404 });
  }

  const { data: photoRows } = await supabase
    .from("car_photos")
    .select("id, angle, storage_path")
    .eq("car_id", car.id);

  let photos = photoRows ?? [];
  if (photos.length === 0 && car.photo_url) {
    photos = [{ id: "legacy", angle: "front_34", storage_path: car.photo_url }];
  }

  const chosen = photoId
    ? photos.find((p) => p.id === photoId) ?? null
    : pickPhotoForMod(category as ModCategory, photos);

  if (!chosen) {
    return NextResponse.json(
      {
        error: `This edit needs a ${neededAnglesText(category as ModCategory)} photo. Add one from My Cars.`,
      },
      { status: 422 }
    );
  }

  const { data: photo, error: downloadError } = await supabase.storage
    .from("car-photos")
    .download(chosen.storage_path);
  if (downloadError || !photo) {
    return NextResponse.json({ error: "Could not read the car photo" }, { status: 500 });
  }

  const { data: jobRow, error: insertError } = await supabase
    .from("edit_jobs")
    .insert({
      user_id: user.id,
      car_id: car.id,
      engine: "detailed",
      part,
      option,
      status: "queued",
    })
    .select("id")
    .single();

  // If migration not applied yet, fall back to in-memory-only via inference id.
  const jobId = jobRow?.id ?? crypto.randomUUID();
  if (insertError) {
    console.warn("edit_jobs insert failed (apply migration?):", insertError.message);
  }

  const form = new FormData();
  form.append("image", photo, "car.jpg");
  form.append("engine", "detailed");
  form.append("part", part);
  form.append("category", category);
  form.append("option", option);
  form.append("job_id", jobId);

  let engineResponse: Response;
  try {
    engineResponse = await fetch(`${inferenceUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      body: form,
      headers: process.env.INFERENCE_API_KEY
        ? { "x-api-key": process.env.INFERENCE_API_KEY }
        : undefined,
    });
  } catch {
    if (jobRow?.id) {
      await supabase
        .from("edit_jobs")
        .update({ status: "failed", error: "Inference unreachable", finished_at: new Date().toISOString() })
        .eq("id", jobRow.id);
    }
    return NextResponse.json({ error: EDITING_OFFLINE_MESSAGE }, { status: 502 });
  }

  if (!engineResponse.ok) {
    let detail = `Engine failed (${engineResponse.status})`;
    try {
      const j = await engineResponse.json();
      if (typeof j?.detail === "string") detail = j.detail;
    } catch {}
    if (jobRow?.id) {
      await supabase
        .from("edit_jobs")
        .update({ status: "failed", error: detail, finished_at: new Date().toISOString() })
        .eq("id", jobRow.id);
    }
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const data = await engineResponse.json();
  return NextResponse.json({
    jobId: data.id ?? jobId,
    status: data.status ?? "queued",
    part,
    photoId: chosen.id,
    beforePath: chosen.storage_path,
    category,
    option,
  });
}
