import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type Ctx = { params: Promise<{ id: string }> };

/** Poll Detailed job status; when done, upload result and create a build. */
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const inferenceUrl = process.env.INFERENCE_URL;
  if (!inferenceUrl) {
    return NextResponse.json({ error: "INFERENCE_URL missing" }, { status: 503 });
  }

  const url = new URL(request.url);
  const beforePath = url.searchParams.get("beforePath");
  const carId = url.searchParams.get("carId");
  const category = url.searchParams.get("category");
  const option = url.searchParams.get("option");

  let engineSnap: {
    id: string;
    status: string;
    error?: string | null;
    part?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  };
  try {
    const res = await fetch(`${inferenceUrl.replace(/\/$/, "")}/jobs/${id}`, {
      headers: process.env.INFERENCE_API_KEY
        ? { "x-api-key": process.env.INFERENCE_API_KEY }
        : undefined,
      cache: "no-store",
    });
    if (res.status === 404) {
      // Fall back to Supabase row if inference restarted
      const { data: row } = await supabase.from("edit_jobs").select("*").eq("id", id).maybeSingle();
      if (!row || row.user_id !== user.id) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({
        jobId: row.id,
        status: row.status,
        error: row.error,
        buildId: row.build_id,
        afterUrl: null,
      });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Engine status ${res.status}` }, { status: 502 });
    }
    engineSnap = await res.json();
  } catch {
    return NextResponse.json({ error: "Inference unreachable" }, { status: 502 });
  }

  // Mirror status into Supabase when the row exists
  await supabase
    .from("edit_jobs")
    .update({
      status: engineSnap.status,
      error: engineSnap.error ?? null,
      started_at: engineSnap.started_at ?? null,
      finished_at: engineSnap.finished_at ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (engineSnap.status === "failed") {
    return NextResponse.json({
      jobId: id,
      status: "failed",
      error: engineSnap.error ?? "Detailed edit failed",
    });
  }

  if (engineSnap.status !== "done") {
    return NextResponse.json({
      jobId: id,
      status: engineSnap.status,
      startedAt: engineSnap.started_at,
    });
  }

  // Already finalized?
  const { data: existing } = await supabase
    .from("edit_jobs")
    .select("build_id")
    .eq("id", id)
    .maybeSingle();
  if (existing?.build_id) {
    const { data: build } = await supabase
      .from("builds")
      .select("id, after_image_url")
      .eq("id", existing.build_id)
      .single();
    let afterUrl: string | null = null;
    if (build?.after_image_url) {
      const signed = await supabase.storage
        .from("car-photos")
        .createSignedUrl(build.after_image_url, SIGNED_URL_TTL_SECONDS);
      afterUrl = signed.data?.signedUrl ?? null;
    }
    return NextResponse.json({
      jobId: id,
      status: "done",
      buildId: existing.build_id,
      afterUrl,
      engine: "detailed",
    });
  }

  if (!beforePath || !carId || !category || !option) {
    return NextResponse.json({
      jobId: id,
      status: "done",
      error: "Missing beforePath/carId/category/option to finalize build",
      needsFinalize: true,
    });
  }

  const resultRes = await fetch(`${inferenceUrl.replace(/\/$/, "")}/jobs/${id}/result`, {
    headers: process.env.INFERENCE_API_KEY
      ? { "x-api-key": process.env.INFERENCE_API_KEY }
      : undefined,
  });
  if (!resultRes.ok) {
    return NextResponse.json({ error: "Could not download result" }, { status: 502 });
  }
  const resultBytes = new Uint8Array(await resultRes.arrayBuffer());
  const afterPath = `${user.id}/builds/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("car-photos")
    .upload(afterPath, resultBytes, { contentType: "image/png" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: build, error: insertError } = await supabase
    .from("builds")
    .insert({
      car_id: carId,
      user_id: user.id,
      mod_category: category,
      before_image_url: beforePath,
      after_image_url: afterPath,
      engine: "detailed",
      params: { option, model: "qwen-image-edit-2511-q4", engine: "detailed", part: engineSnap.part },
    })
    .select("id")
    .single();

  if (insertError) {
    // Retry without engine column if migration not applied
    const retry = await supabase
      .from("builds")
      .insert({
        car_id: carId,
        user_id: user.id,
        mod_category: category,
        before_image_url: beforePath,
        after_image_url: afterPath,
        params: { option, model: "qwen-image-edit-2511-q4", engine: "detailed", part: engineSnap.part },
      })
      .select("id")
      .single();
    if (retry.error || !retry.data) {
      await supabase.storage.from("car-photos").remove([afterPath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    await supabase
      .from("edit_jobs")
      .update({ status: "done", build_id: retry.data.id, result_path: afterPath })
      .eq("id", id);
    const { data: signed } = await supabase.storage
      .from("car-photos")
      .createSignedUrl(afterPath, SIGNED_URL_TTL_SECONDS);
    return NextResponse.json({
      jobId: id,
      status: "done",
      buildId: retry.data.id,
      afterUrl: signed?.signedUrl ?? null,
      engine: "detailed",
    });
  }

  await supabase
    .from("edit_jobs")
    .update({ status: "done", build_id: build.id, result_path: afterPath })
    .eq("id", id);

  const { data: signed } = await supabase.storage
    .from("car-photos")
    .createSignedUrl(afterPath, SIGNED_URL_TTL_SECONDS);

  return NextResponse.json({
    jobId: id,
    status: "done",
    buildId: build.id,
    afterUrl: signed?.signedUrl ?? null,
    engine: "detailed",
  });
}
