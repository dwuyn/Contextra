import type { ContinuityRefreshStatus } from "@/types/project";
import { DEFAULT_COLLAB_PORT, getCollaborationInternalSecret as readCollaborationInternalSecret } from "@/lib/collaboration/config";

const INTERNAL_SECRET_HEADER = "x-collab-internal-secret";

function getCollaborationInternalBaseUrl() {
  if (process.env.COLLAB_INTERNAL_URL) {
    return process.env.COLLAB_INTERNAL_URL.replace(/\/$/, "");
  }

  const port = Number(process.env.COLLAB_PORT);
  const safePort = Number.isFinite(port) && port > 0 ? port : DEFAULT_COLLAB_PORT;
  return `http://127.0.0.1:${safePort}`;
}

function getCollaborationInternalSecret() {
  return readCollaborationInternalSecret();
}

async function postCollaborationInternal<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${getCollaborationInternalBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [INTERNAL_SECRET_HEADER]: getCollaborationInternalSecret(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export async function exportCollaborativeChapter(params: {
  projectId: string;
  chapterId: string;
}) {
  return postCollaborationInternal<{
    html: string;
    continuity: ContinuityRefreshStatus;
  }>("/internal/documents/export", params);
}

export async function replaceCollaborativeChapter(params: {
  chapterId: string;
  projectId: string;
  html: string;
}) {
  return postCollaborationInternal<{
    html: string;
    continuity: ContinuityRefreshStatus;
  }>("/internal/documents/replace", params);
}

export async function syncCollaborativeChapterDocument(params: {
  chapterId: string;
  projectId: string;
  html: string;
}) {
  return postCollaborationInternal<{
    html: string;
  }>("/internal/documents/sync", params);
}

export async function getCollaborationPersistenceHealth() {
  try {
    const baseUrl = getCollaborationInternalBaseUrl();
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      return { status: "degraded", lastError: `HTTP status ${response.status}` };
    }
    const data = await response.json();
    return {
      status: data.status === "degraded" ? "degraded" : "healthy",
      lastError: data.unhealthyDocuments && data.unhealthyDocuments.length > 0
        ? `Degraded documents: ${data.unhealthyDocuments.join(", ")}`
        : null,
      unhealthyDocuments: data.unhealthyDocuments || [],
    };
  } catch (error) {
    return {
      status: "degraded",
      lastError: error instanceof Error ? error.message : String(error),
      unhealthyDocuments: [],
    };
  }
}
