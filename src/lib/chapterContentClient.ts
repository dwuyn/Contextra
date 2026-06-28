"use client";

export type ChapterContentPayload = {
  title: string;
  content: string;
  updatedAt: string;
};

const inFlightChapterContentRequests = new Map<string, Promise<ChapterContentPayload>>();

function getChapterContentRequestKey(projectId: string, chapterId: string) {
  return `${projectId}:${chapterId}`;
}

async function requestChapterContent(projectId: string, chapterId: string) {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/content`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(errorMessage || "Failed to load chapter content");
  }

  return response.json() as Promise<ChapterContentPayload>;
}

export function fetchChapterContent(projectId: string, chapterId: string) {
  const requestKey = getChapterContentRequestKey(projectId, chapterId);
  const existingRequest = inFlightChapterContentRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = requestChapterContent(projectId, chapterId).finally(() => {
    inFlightChapterContentRequests.delete(requestKey);
  });

  inFlightChapterContentRequests.set(requestKey, request);
  return request;
}
