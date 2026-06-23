import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";
import { syncCollaborativeChapterDocument } from "@/lib/collaboration/internal";
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
  const { title, content, isCollaborative } = body;

  if (isCollaborative) {
    return new NextResponse("Collaborative saves not supported on keepalive route", { status: 400 });
  }

  try {
    const result = await projectService.updateChapter(projectId, session.userId, chapterId, {
      title,
      content,
      createVersion: false,
    });

    revalidatePath("/");
    revalidatePath(`/project/${projectId}`);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Keepalive save failed", error);
    return new NextResponse(error instanceof Error ? error.message : "Internal Server Error", { status: 500 });
  }
}
