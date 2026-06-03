import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { addConnection } from "@/lib/realtime";
import { sseConnectionCheck, sseConnectionRelease } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.userId;

  if (!sseConnectionCheck(userId, 20)) {
    return new Response("Too many SSE connections", { status: 429 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const remove = addConnection(userId, controller);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        remove();
        sseConnectionRelease(userId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
