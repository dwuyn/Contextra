import { getSession } from "@/lib/auth";
import { sendEvent } from "@/lib/realtime";
import * as projectService from "@/services/projectService";
import * as z from "@/lib/validations";

type PresenceRequestBody = {
  projectId?: string;
  chapterId?: string | null;
  state?: "viewing" | "editing";
  action?: "upsert" | "leave";
};

async function fanOutProjectPresence(projectId: string, eventData: { projectId: string; userId: string; presence: unknown }) {
  const audience = await projectService.listProjectAudience(projectId, [eventData.userId]);
  for (const userId of audience) {
    sendEvent(userId, "project_presence_updated", eventData);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as PresenceRequestBody;
  if (!body.projectId) {
    return new Response("Missing projectId", { status: 400 });
  }

  try {
    if (body.action === "leave") {
      await projectService.leaveProjectPresence(body.projectId, session.userId);
      await fanOutProjectPresence(body.projectId, {
        projectId: body.projectId,
        userId: session.userId,
        presence: null,
      });
      return Response.json({ ok: true });
    }

    const parsed = z.UpsertProjectPresenceSchema.parse({
      chapterId: body.chapterId ?? null,
      state: body.state,
    });
    const presence = await projectService.upsertProjectPresence(body.projectId, session.userId, parsed);
    await fanOutProjectPresence(body.projectId, {
      projectId: body.projectId,
      userId: session.userId,
      presence,
    });
    return Response.json(presence);
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
