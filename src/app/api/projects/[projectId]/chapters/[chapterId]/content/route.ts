import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; chapterId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { projectId, chapterId } = await params;

  try {
    const chapter = await projectService.getChapterContent(projectId, session.userId, chapterId);
    return NextResponse.json(chapter);
  } catch (error) {
    console.error("Failed to load chapter content", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { status: 500 },
    );
  }
}
