import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { isSupportedSpeechRate, SPEECH_RATE_OPTIONS } from "@/lib/voiceReader";
import {
  getTextToSpeechClient,
  isConfiguredVoice,
  synthesizeWithSsml,
  synthesizeWithText,
} from "@/services/googleTtsService";
import {
  normalizeText,
  processSegmentForTTS,
  type PronunciationEntryData,
} from "@/services/pronunciationService";
import { requireProjectPermission } from "@/services/projectService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PreviewInput = {
  projectId: string;
  language: "en-US" | "vi-VN";
  voiceId: string;
  rate: number;
  text: string;
  entryOverride?: Array<{
    term: string;
    replacement: string;
    renderMode: "sub" | "phoneme" | "say_as" | "plain";
    matchMode: "whole_word" | "literal";
    caseSensitive?: boolean;
    priority?: number;
    enabled?: boolean;
  }>;
};

function validateInput(body: unknown): PreviewInput | string {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }

  const data = body as Record<string, unknown>;

  // projectId
  if (typeof data.projectId !== "string" || !data.projectId.trim()) {
    return "projectId is required and must be a non-empty string.";
  }

  // language
  if (data.language !== "en-US" && data.language !== "vi-VN") {
    return 'language must be "en-US" or "vi-VN".';
  }

  // voiceId
  if (typeof data.voiceId !== "string" || !data.voiceId.trim()) {
    return "voiceId is required and must be a non-empty string.";
  }

  // rate
  if (typeof data.rate !== "number" || !isSupportedSpeechRate(data.rate)) {
    return `rate must be one of: ${SPEECH_RATE_OPTIONS.join(", ")}.`;
  }

  // text
  if (typeof data.text !== "string" || data.text.length < 1 || data.text.length > 300) {
    return "text is required and must be 1-300 characters.";
  }

  // entryOverride (optional)
  if (data.entryOverride !== undefined) {
    if (!Array.isArray(data.entryOverride)) {
      return "entryOverride must be an array if provided.";
    }
    for (let i = 0; i < data.entryOverride.length; i++) {
      const entry = data.entryOverride[i] as Record<string, unknown>;
      if (typeof entry.term !== "string" || !entry.term.trim()) {
        return `entryOverride[${i}].term is required.`;
      }
      if (typeof entry.replacement !== "string" || !entry.replacement.trim()) {
        return `entryOverride[${i}].replacement is required.`;
      }
      const VALID_RENDER_MODES = new Set(["sub", "phoneme", "say_as", "plain"]);
      const VALID_MATCH_MODES = new Set(["whole_word", "literal"]);
      if (!VALID_RENDER_MODES.has(entry.renderMode as string)) {
        return `entryOverride[${i}].renderMode must be "sub", "phoneme", "say_as", or "plain".`;
      }
      if (!VALID_MATCH_MODES.has(entry.matchMode as string)) {
        return `entryOverride[${i}].matchMode must be "whole_word" or "literal".`;
      }
    }
  }

  return {
    projectId: data.projectId,
    language: data.language,
    voiceId: data.voiceId,
    rate: data.rate,
    text: data.text,
    entryOverride: data.entryOverride as PreviewInput["entryOverride"],
  };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const validated = validateInput(body);
  if (typeof validated === "string") {
    return new Response(validated, { status: 400 });
  }

  const { projectId, language, voiceId, rate, text, entryOverride } = validated;

  try {
    await requireProjectPermission(projectId, session.userId, "view");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  // Validate voice is configured for the language
  if (!isConfiguredVoice(language, voiceId)) {
    return new Response("Voice not configured for this language.", { status: 400 });
  }

  const client = getTextToSpeechClient();

  try {
    let audioBuffer: Buffer;

    if (language === "vi-VN") {
      // Load entries from DB or use entryOverride
      let entries: PronunciationEntryData[];
      if (entryOverride) {
        entries = entryOverride.map((e) => ({
          term: e.term,
          replacement: e.replacement,
          renderMode: e.renderMode,
          matchMode: e.matchMode,
          caseSensitive: e.caseSensitive ?? false,
          priority: e.priority ?? 0,
          enabled: e.enabled ?? true,
        }));
      } else {
        const dbEntries = await prisma.pronunciationEntry.findMany({
          where: { projectId, language, enabled: true },
          orderBy: [{ priority: "desc" }, { term: "asc" }],
          select: {
            term: true,
            replacement: true,
            renderMode: true,
            matchMode: true,
            caseSensitive: true,
            priority: true,
            enabled: true,
          },
        });
        entries = dbEntries as PronunciationEntryData[];
      }

      const { ssml } = processSegmentForTTS({
        projectId,
        text,
        entries,
        language,
      });

      try {
        audioBuffer = await synthesizeWithSsml(client, ssml, language, voiceId, rate);
      } catch {
        // Fallback to plain text
        const normalized = normalizeText(text);
        audioBuffer = await synthesizeWithText(client, normalized, language, voiceId, rate);
      }
    } else {
      // en-US: plain text
      audioBuffer = await synthesizeWithText(client, text, language, voiceId, rate);
    }

    const body = new Uint8Array(audioBuffer);

    return new Response(body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to synthesize pronunciation preview:", error);
    return new Response("TTS synthesis failed.", { status: 503 });
  }
}
