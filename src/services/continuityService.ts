import "server-only";

import {
  enqueueChapterContinuityJob,
  refreshChapterContinuityNow,
  type ChapterContinuityInput,
} from "@/services/continuityJobService";
import type { ContinuityRefreshStatus } from "@/types/project";

const CONTINUITY_STALE_WARNING =
  "Saved, but continuity memory did not refresh. The next AI result may use stale context until a later save succeeds.";

const CONTINUITY_QUEUED_WARNING =
  "Saved. Continuity memory refresh is queued, so AI may use previous memory until the worker completes.";

export const refreshChapterContinuity = refreshChapterContinuityNow;

export async function refreshChapterContinuityStatus(
  input: ChapterContinuityInput,
): Promise<ContinuityRefreshStatus> {
  try {
    await enqueueChapterContinuityJob(input);
    return {
      fresh: false,
      status: "queued",
      warning: CONTINUITY_QUEUED_WARNING,
    };
  } catch (error) {
    console.error("Continuity refresh failed:", error);
    return {
      fresh: false,
      status: "stale",
      warning: CONTINUITY_STALE_WARNING,
    };
  }
}
