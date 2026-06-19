import { getSession } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rateLimit";
import { GenerateChapterIllustrationSchema } from "@/lib/validations";
import * as projectService from "@/services/projectService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const illustrationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 40,
  keyPrefix: "ai:chapter-illustration:",
});

function getErrorResponse(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (message === "Unauthorized") {
    return new Response("Forbidden", { status: 403 });
  }

  if (message === "Chapter not found" || message === "Illustration not found") {
    return new Response(message, { status: 404 });
  }

  if (
    message === "Add some chapter content before generating an illustration." ||
    message === "AI returned an invalid image prompt. Please try again." ||
    message === "Image prompt generation returned empty output."
  ) {
    return new Response(message, { status: 400 });
  }

  console.error(fallbackMessage, error);
  return new Response(fallbackMessage, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; chapterId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId, chapterId } = await params;

  try {
    const illustration = await projectService.getChapterIllustration(projectId, session.userId, chapterId);

    return new Response(new Uint8Array(illustration.buffer), {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(illustration.buffer.byteLength),
        "Content-Type": illustration.contentType,
        ETag: `"${illustration.illustration?.generatedAt ?? request.url}"`,
      },
    });
  } catch (error) {
    return getErrorResponse(error, "Failed to load chapter illustration.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; chapterId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rateCheck = await illustrationRateLimiter(request);
  if (!rateCheck.allowed) {
    return new Response("Too many requests", { status: 429 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return new Response("Missing or invalid illustration payload", { status: 400 });
  }

  const body = GenerateChapterIllustrationSchema.safeParse(payload);
  if (!body.success) {
    return new Response("Missing or invalid illustration payload", { status: 400 });
  }

  const { projectId, chapterId } = await params;

  try {
    const illustration = await projectService.generateChapterIllustration(
      projectId,
      session.userId,
      chapterId,
      body.data,
    );

    return Response.json({ illustration });
  } catch (error) {
    return getErrorResponse(error, "Failed to generate chapter illustration.");
  }
}
