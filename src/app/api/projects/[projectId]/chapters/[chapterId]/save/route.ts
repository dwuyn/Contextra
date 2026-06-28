import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";
import { sendEvent } from "@/lib/realtime";
import { revalidatePath } from "next/cache";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; chapterId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [{ projectId, chapterId }, body] = await Promise.all([params, req.json()]);
  const { title, content, expectedUpdatedAt } = body;

  try {
    const result = await projectService.updateChapter(projectId, session.userId, chapterId, {
      title,
      content,
      createVersion: false,
      expectedUpdatedAt,
    });

    if (result.status === "conflict") {
      return NextResponse.json(result, { status: 409 });
    }

    revalidatePath("/");
    revalidatePath(`/project/${projectId}`);

    const audience = await projectService.listProjectAudience(projectId, [session.userId]);
    for (const userId of audience) {
      sendEvent(userId, "project_chapter_saved", {
        projectId,
        chapterId,
        title: title ?? "",
        updatedAt: result.updatedAt,
        savedByUserId: session.userId,
        savedByName: session.name,
      });
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Keepalive save failed", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Server Error", { status: 500 });
  }
}
