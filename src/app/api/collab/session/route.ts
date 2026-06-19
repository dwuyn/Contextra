import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";

export const dynamic = "force-dynamic";

function normalizeWebsocketUrl(input: string) {
  if (input.startsWith("ws://") || input.startsWith("wss://")) {
    return input;
  }

  if (input.startsWith("http://")) {
    return `ws://${input.slice("http://".length)}`;
  }

  if (input.startsWith("https://")) {
    return `wss://${input.slice("https://".length)}`;
  }

  return input;
}

function getCollaborationWebsocketUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (configured) {
    return normalizeWebsocketUrl(configured);
  }

  if (process.env.NODE_ENV !== "production") {
    const port = Number(process.env.COLLAB_PORT);
    const safePort = Number.isFinite(port) && port > 0 ? port : 1234;
    return `ws://127.0.0.1:${safePort}/collab`;
  }

  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const wsProtocol = protocol === "https" ? "wss" : "ws";
  return `${wsProtocol}://${host}/collab`;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const chapterId = request.nextUrl.searchParams.get("chapterId");
  if (!projectId || !chapterId) {
    return new Response("Missing projectId or chapterId", { status: 400 });
  }

  try {
    const collaborationSession = await projectService.createChapterCollaborationSession(
      projectId,
      session.userId,
      chapterId,
      getCollaborationWebsocketUrl(request),
    );

    return Response.json(collaborationSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status =
      message === "Unauthorized" || message === "Collaborative access required"
        ? 403
        : message === "Chapter not found"
          ? 404
          : 400;

    return new Response(message, { status });
  }
}
