import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

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
    return NextResponse.json({ error: "The AI engine is not configured." }, { status: 503 });
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const image = incoming.get("image");
  if (!(image instanceof Blob)) {
    return NextResponse.json({ error: "No image" }, { status: 400 });
  }

  const form = new FormData();
  form.append("image", image, "car.jpg");

  let res: Response;
  try {
    res = await fetch(`${inferenceUrl.replace(/\/$/, "")}/identify`, {
      method: "POST",
      body: form,
      headers: process.env.INFERENCE_API_KEY
        ? { "x-api-key": process.env.INFERENCE_API_KEY }
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "The AI engine is not reachable. Is the inference server running?" },
      { status: 502 }
    );
  }
  if (!res.ok) {
    return NextResponse.json({ error: `Identification failed (${res.status}).` }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
