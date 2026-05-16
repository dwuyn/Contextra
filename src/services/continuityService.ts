import { deleteChapterSummary, upsertChapterSummary } from "@/services/memoryService";
import { processAndSaveChapterChunks } from "@/services/ragService";
import type { ContinuityRefreshStatus } from "@/types/project";

type ChapterContinuityInput = {
  chapterId: string;
  title: string;
  content: string;
};

const CONTINUITY_STALE_WARNING =
  "Saved, but continuity memory did not refresh. The next AI result may use stale context until a later save succeeds.";

function isBlankContent(content: string) {
  return !content.replace(/<[^>]+>/g, " ").trim();
}

export async function refreshChapterContinuity({ chapterId, title, content }: ChapterContinuityInput) {
  if (isBlankContent(content)) {
    await Promise.all([
      processAndSaveChapterChunks(chapterId, ""),
      deleteChapterSummary(chapterId),
    ]);
    return;
  }

  await Promise.all([
    processAndSaveChapterChunks(chapterId, content),
    upsertChapterSummary({ chapterId, title, content }),
  ]);
}

export async function refreshChapterContinuityStatus(
  input: ChapterContinuityInput,
): Promise<ContinuityRefreshStatus> {
  try {
    await refreshChapterContinuity(input);
    return { fresh: true };
  } catch (error) {
    console.error("Continuity refresh failed:", error);
    return {
      fresh: false,
      warning: CONTINUITY_STALE_WARNING,
    };
  }
}
