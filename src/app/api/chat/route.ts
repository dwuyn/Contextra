import { streamText } from 'ai';
import { chatModel } from '@/lib/ai';
import { getSession } from '@/lib/auth';
import { createRateLimiter } from '@/lib/rateLimit';
import { ChatRequestSchema } from '@/lib/validations';
import { composeContext } from '@/services/contextService';
import { semanticSearch } from '@/services/ragService';
import { requireBranchInProject, requireProjectPermission } from '@/services/projectService';
import { buildChatSystemPrompt } from '@/services/writingPromptService';

export const runtime = "nodejs";
export const maxDuration = 300;

const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 300,
  keyPrefix: "ai:",
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const body = ChatRequestSchema.safeParse(await req.json());
  if (!body.success) {
    return new Response('Missing or invalid chat payload', { status: 400 });
  }

  const { messages, projectId, branchId } = body.data;

  const rateCheck = await aiRateLimiter(req);
  if (!rateCheck.allowed) {
    return new Response('Too many requests', { status: 429 });
  }

  try {
    await requireProjectPermission(projectId, session.userId, 'view');
    await requireBranchInProject(projectId, branchId);
  } catch (error) {
    if (error instanceof Error && error.message === 'Branch not found') {
      return new Response('Branch not found', { status: 404 });
    }
    return new Response('Unauthorized', { status: 401 });
  }

  const lastMessage = messages[messages.length - 1]?.content || "";
  const context = await composeContext(projectId, branchId, lastMessage, semanticSearch);

  const result = streamText({
    model: chatModel(),
    system: buildChatSystemPrompt(context, lastMessage),
    messages,
  });

  return result.toTextStreamResponse();
}
