import { NextResponse } from "next/server";

export async function GET() {
  const inferenceUrl = process.env.INFERENCE_URL;
  if (!inferenceUrl) {
    return NextResponse.json({
      fast: { id: "fast", label: "Fast", ready: false, reason: "INFERENCE_URL not set" },
      detailed: { id: "detailed", label: "Detailed", ready: false, reason: "INFERENCE_URL not set" },
    });
  }
  try {
    const res = await fetch(`${inferenceUrl.replace(/\/$/, "")}/engines`, {
      headers: process.env.INFERENCE_API_KEY
        ? { "x-api-key": process.env.INFERENCE_API_KEY }
        : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          fast: { id: "fast", label: "Fast", ready: false, reason: `engine HTTP ${res.status}` },
          detailed: {
            id: "detailed",
            label: "Detailed",
            ready: false,
            reason: `engine HTTP ${res.status}`,
          },
        },
        { status: 502 }
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      fast: {
        id: "fast",
        label: "Fast",
        ready: false,
        reason: "Inference server not reachable",
      },
      detailed: {
        id: "detailed",
        label: "Detailed",
        ready: false,
        reason: "Inference server not reachable",
      },
    });
  }
}
