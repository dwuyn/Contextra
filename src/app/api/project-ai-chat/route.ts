import { streamText } from "ai";
import { customAi } from "@/lib/ai";
import { getSession } from "@/lib/auth";
import { ProjectAiChatRequestSchema } from "@/lib/validations";
import { composeContext } from "@/services/contextService";
import { semanticSearch } from "@/services/ragService";
import {
  createProjectAiMessage,
  listProjectAiMessages,
  requireBranchInProject,
  requireProjectPermission,
} from "@/services/projectService";
import { buildChatSystemPrompt } from "@/services/writingPromptService";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const payload = ProjectAiChatRequestSchema.safeParse(await req.json());
  if (!payload.success) {
    return new Response("Missing or invalid chat payload", { status: 400 });
  }

  const { projectId, branchId, content } = payload.data;

  try {
    await requireProjectPermission(projectId, session.userId, "view");
    await requireBranchInProject(projectId, branchId);
  } catch (error) {
    if (error instanceof Error && error.message === "Branch not found") {
      return new Response("Branch not found", { status: 404 });
    }

    return new Response("Unauthorized", { status: 401 });
  }

  await createProjectAiMessage({
    projectId,
    branchId,
    authorUserId: session.userId,
    role: "user",
    content,
  });

  const [messages, context] = await Promise.all([
    listProjectAiMessages(projectId),
    composeContext(projectId, branchId, content, semanticSearch),
  ]);

  const result = streamText({
    model: customAi.chat("gemma4:31b-cloud"),
    system: buildChatSystemPrompt(context, content),
    messages: messages.map(({ role, content: messageContent }) => ({
      role,
      content: messageContent,
    })),
    // Persist the assistant only after the streamed response fully completes.
    onFinish: async ({ text }) => {
      if (!text.trim()) return;

      await createProjectAiMessage({
        projectId,
        branchId,
        role: "assistant",
        content: text,
      });
    },
  });

  return result.toTextStreamResponse();
}
