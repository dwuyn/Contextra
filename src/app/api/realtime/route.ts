import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { addConnection } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.userId;

  const stream = new ReadableStream({
    start(controller) {
      const remove = addConnection(userId, controller);

      req.signal.addEventListener("abort", () => {
        remove();
      });

      // Keep-alive heartbeat every 15 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 15000);
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
