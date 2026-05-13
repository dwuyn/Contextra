import { streamText } from 'ai';
import { customAi } from '@/lib/ai';
import { getSession } from '@/lib/auth';
import { composeContext } from '@/services/contextService';

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { messages, projectId, branchId } = await req.json();

  if (!projectId || !branchId) {
    return new Response('Missing projectId or branchId', { status: 400 });
  }

  const context = await composeContext(projectId, branchId);

  const systemPrompt = `
You are an expert creative writing assistant. 
You are helping the user write a story called "${context.projectName}".

Project Context:
- Summary: ${context.projectSummary}
- Tone: ${context.tone}
- Audience: ${context.audience}
- World Rules: ${context.worldRules.join(", ")}

Branch Context:
- Current Branch: ${context.branchName}
- Branch Description: ${context.branchDescription}

Recent Continuity:
${context.recentChapters.join("\n")}

Guidelines:
- Be helpful, creative, and strictly adhere to the project's tone and continuity.
- If asked to brainstorm, provide vivid and interesting options.
- If asked about the world or characters, refer to the provided context.
- Keep responses concise but engaging.
`.trim();

  const result = streamText({
    model: customAi.chat("gemma4:31b-cloud"),
    system: systemPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
