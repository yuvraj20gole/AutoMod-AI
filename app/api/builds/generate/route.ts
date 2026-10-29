import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidMod, type ModCategory } from "@/lib/mods";
import { pickPhotoForMod, neededAnglesText } from "@/lib/angles";
import { EDITING_OFFLINE_MESSAGE } from "@/lib/engines/offline";

export const maxDuration = 300;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

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

  let body: { carId?: string; category?: string; option?: string; photoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { carId, category, option, photoId } = body;
  if (!carId || !category || !option || !isValidMod(category, option)) {
    return NextResponse.json({ error: "Invalid modification" }, { status: 400 });
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
      { error: `This edit needs a ${neededAnglesText(category as ModCategory)} photo. Add one from My Cars.` },
      { status: 422 }
    );
  }

  const { data: photo, error: downloadError } = await supabase.storage
    .from("car-photos")
    .download(chosen.storage_path);

  if (downloadError || !photo) {
    return NextResponse.json({ error: "Could not read the car photo" }, { status: 500 });
  }

  const form = new FormData();
  form.append("image", photo, "car.jpg");
  form.append("category", category);
  form.append("option", option);
  form.append("seed", String(Math.floor(Math.random() * 1_000_000)));

  let engineResponse: Response;
  try {
    engineResponse = await fetch(`${inferenceUrl.replace(/\/$/, "")}/edit`, {
      method: "POST",
      body: form,
      headers: process.env.INFERENCE_API_KEY
        ? { "x-api-key": process.env.INFERENCE_API_KEY }
        : undefined,
    });
  } catch {
    return NextResponse.json({ error: EDITING_OFFLINE_MESSAGE }, { status: 502 });
  }

  if (engineResponse.status === 422) {
    let detail = "This photo can't be used for that edit.";
    try {
      const body = await engineResponse.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {}
    return NextResponse.json({ error: detail }, { status: 422 });
  }

  if (!engineResponse.ok) {
    return NextResponse.json(
      { error: `The AI engine failed (${engineResponse.status}).` },
      { status: 502 }
    );
  }

  const instruction = engineResponse.headers.get("x-instruction");
  const model = engineResponse.headers.get("x-model");
  const resultBytes = new Uint8Array(await engineResponse.arrayBuffer());

  const afterPath = `${user.id}/builds/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("car-photos")
    .upload(afterPath, resultBytes, { contentType: "image/png" });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const buildPayload = {
    car_id: car.id,
    user_id: user.id,
    mod_category: category,
    before_image_url: chosen.storage_path,
    after_image_url: afterPath,
    engine: "fast" as const,
    params: { option, instruction, model, angle: chosen.angle, engine: "fast" },
  };

  let { data: build, error: insertError } = await supabase
    .from("builds")
    .insert(buildPayload)
    .select("id")
    .single();

  // Migration may not be applied yet — retry without the engine column.
  if (insertError?.message?.includes("engine")) {
    const { engine: _e, ...withoutEngine } = buildPayload;
    const retry = await supabase.from("builds").insert(withoutEngine).select("id").single();
    build = retry.data;
    insertError = retry.error;
  }

  if (insertError || !build) {
    await supabase.storage.from("car-photos").remove([afterPath]);
    return NextResponse.json({ error: insertError?.message ?? "insert failed" }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from("car-photos")
    .createSignedUrl(afterPath, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({ buildId: build.id, afterUrl: signed?.signedUrl ?? null, model, photoId: chosen.id });
}
