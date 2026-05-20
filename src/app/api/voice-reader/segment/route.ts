import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { isReaderLanguage, isSupportedSpeechRate } from "@/lib/voiceReader";
import { prisma } from "@/lib/prisma";
import { synthesizeChapterSegment } from "@/services/googleTtsService";
import { requireProjectPermission } from "@/services/projectService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");
  const chapterId = searchParams.get("chapterId");
  const language = searchParams.get("lang");
  const voiceId = searchParams.get("voice");
  const rateValue = Number(searchParams.get("rate"));
  const segmentIndex = Number.parseInt(searchParams.get("index") ?? "", 10);

  if (
    !projectId ||
    !chapterId ||
    !language ||
    !voiceId ||
    !Number.isInteger(segmentIndex) ||
    segmentIndex < 0 ||
    !isReaderLanguage(language) ||
    !Number.isFinite(rateValue) ||
    !isSupportedSpeechRate(rateValue)
  ) {
    return new Response("Missing or invalid voice reader query.", { status: 400 });
  }

  try {
    await requireProjectPermission(projectId, session.userId, "view");

    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, projectId },
      select: {
        id: true,
        projectId: true,
        title: true,
        content: true,
        updatedAt: true,
      },
    });

    if (!chapter) {
      return new Response("Chapter not found", { status: 404 });
    }

    const result = await synthesizeChapterSegment({
      projectId: chapter.projectId,
      chapterId: chapter.id,
      chapterUpdatedAt: chapter.updatedAt,
      chapterTitle: chapter.title,
      chapterContent: chapter.content,
      language,
      voiceId,
      rate: rateValue,
      segmentIndex,
    });

    const body = new Uint8Array(result.audioBuffer);

    return new Response(body, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
        "X-Voice-Reader-Segment-Count": String(result.segmentCount),
        "X-Voice-Reader-Cache": result.cacheHit ? "hit" : "miss",
      },
    });
  } catch (error) {
    console.error("Failed to synthesize Google TTS segment:", error);
    const message =
      error instanceof Error ? error.message : "Failed to synthesize audio.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Segment not found."
          ? 404
          : message === "Unsupported Google TTS voice." || message === "Unsupported reader speed."
            ? 400
            : 503;

    return new Response(message, { status });
  }
}
