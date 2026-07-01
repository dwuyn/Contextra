import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { isReaderLanguage } from "@/lib/voiceReader";
import { listAvailableVoices } from "@/services/googleTtsService";
import { requireProjectPermission } from "@/services/projectService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  const language = req.nextUrl.searchParams.get("lang");

  if (!projectId || !language || !isReaderLanguage(language)) {
    return new Response("Missing or invalid voice reader query.", { status: 400 });
  }

  try {
    await requireProjectPermission(projectId, session.userId, "view");
    const voices = await listAvailableVoices(language);
    return Response.json({
      voices,
    });
  } catch (error) {
    console.error("Failed to load Google Cloud TTS voices:", error);
    const message =
      error instanceof Error && error.message === "Unauthorized"
        ? "Unauthorized"
        : error instanceof Error
          ? error.message
          : "Failed to load voices.";
    return new Response(message, { status: message === "Unauthorized" ? 401 : 503 });
  }
}
