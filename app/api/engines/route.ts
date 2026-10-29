import { NextResponse } from "next/server";
import { EDITING_OFFLINE_MESSAGE, offlineEnginesPayload } from "@/lib/engines/offline";

export const maxDuration = 15;

/** Short probe — hosted sites must not hang waiting for a Mac-only engine. */
const ENGINES_PROBE_MS = 3_000;

export async function GET() {
  const inferenceUrl = process.env.INFERENCE_URL;
  if (!inferenceUrl) {
    return NextResponse.json(offlineEnginesPayload(EDITING_OFFLINE_MESSAGE));
  }
  try {
    const res = await fetch(`${inferenceUrl.replace(/\/$/, "")}/engines`, {
      headers: process.env.INFERENCE_API_KEY
        ? { "x-api-key": process.env.INFERENCE_API_KEY }
        : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(ENGINES_PROBE_MS),
    });
    if (!res.ok) {
      return NextResponse.json(offlineEnginesPayload(EDITING_OFFLINE_MESSAGE), {
        status: 502,
      });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json(offlineEnginesPayload(EDITING_OFFLINE_MESSAGE));
  }
}
