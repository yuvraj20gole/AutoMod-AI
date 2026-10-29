import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAdvisorChat, type AdvisorChatState } from "@/lib/advisor/chat";
import type { ChatMessage } from "@/lib/advisor/intent";
import type { EngineType, Goal } from "@/lib/advisor/data";

export const maxDuration = 60;

async function detailedJobBusy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("edit_jobs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "running"])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Stream approved explanation in small chunks so the UI can animate. */
function chunkText(text: string, size = 18): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

/**
 * POST /api/advisor/chat
 * Body: { messages, car: { make, model, year }, state? }
 * Response: text/event-stream with meta → token* → done
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    messages?: ChatMessage[];
    car?: { make?: string; model?: string; year?: number | null };
    state?: Partial<AdvisorChatState>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const make = body.car?.make?.trim();
  const model = body.car?.model?.trim();
  if (!make || !model || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages and car.make/model required" }, { status: 400 });
  }

  const forceBasic = await detailedJobBusy(supabase, user.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        const response = await runAdvisorChat({
          messages: body.messages!,
          car: {
            make,
            model,
            year: body.car?.year ?? null,
          },
          state: {
            goal: (body.state?.goal as Goal | null | undefined) ?? null,
            budgetMax: body.state?.budgetMax ?? null,
            engine: (body.state?.engine as EngineType | null | undefined) ?? null,
          },
          forceBasic,
        });

        send({
          type: "meta",
          mode: response.mode,
          model: response.model,
          statusLabel: response.statusLabel,
          intent: response.intent,
          state: response.state,
          result: response.result,
          explanationSource: response.explanationSource,
          needs: response.needs,
          ask: response.ask,
          forceBasic,
        });

        // Prefer the post-checked explanation (never the raw buffer if rejected).
        const text = response.explanation;
        for (const piece of chunkText(text)) {
          send({ type: "token", t: piece });
        }
        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Advisor chat failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
