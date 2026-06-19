import { randomUUID } from "node:crypto";
import path from "node:path";
import { Storage } from "@google-cloud/storage";

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

let cachedStorage: Storage | null = null;

function requireEnv(name: "GOOGLE_CHAPTER_IMAGE_BUCKET") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getGoogleClientOptions() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  return projectId ? { projectId } : undefined;
}

function getStorageClient() {
  cachedStorage ??= new Storage(getGoogleClientOptions());
  return cachedStorage;
}

function getBucket() {
  return getStorageClient().bucket(requireEnv("GOOGLE_CHAPTER_IMAGE_BUCKET"));
}

function sanitizeKeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function getExtensionForContentType(contentType: string) {
  const extension = CONTENT_TYPE_TO_EXTENSION[contentType];
  if (!extension) {
    throw new Error(`Unsupported illustration content type: ${contentType}`);
  }
  return extension;
}

function buildObjectPath(projectId: string, chapterId: string, contentType: string) {
  return path.posix.join(
    "chapter-illustrations",
    sanitizeKeyPart(projectId),
    sanitizeKeyPart(chapterId),
    `${randomUUID()}${getExtensionForContentType(contentType)}`,
  );
}

export async function storeChapterIllustration(input: {
  projectId: string;
  chapterId: string;
  contentType: string;
  bytes: Uint8Array;
}) {
  const objectPath = buildObjectPath(input.projectId, input.chapterId, input.contentType);
  const file = getBucket().file(objectPath);

  await file.save(Buffer.from(input.bytes), {
    resumable: false,
    contentType: input.contentType,
    metadata: {
      cacheControl: "private, max-age=31536000, immutable",
    },
  });

  return {
    objectPath,
    contentType: input.contentType,
  };
}

export async function readChapterIllustrationObject(objectPath: string) {
  const file = getBucket().file(objectPath);

  try {
    const [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
    const contentType = metadata.contentType?.trim();

    if (!contentType) {
      throw new Error("Illustration content type missing.");
    }

    return {
      buffer,
      contentType,
    };
  } catch (error) {
    const statusCode = Number((error as { code?: unknown }).code);
    if (statusCode === 404) {
      throw new Error("Illustration not found");
    }

    throw error;
  }
}

export async function deleteChapterIllustrationObject(objectPath: string) {
  try {
    await getBucket().file(objectPath).delete();
  } catch (error) {
    const statusCode = Number((error as { code?: unknown }).code);
    if (statusCode !== 404) {
      throw error;
    }
  }
}

export async function deleteChapterIllustrationObjects(objectPaths: string[]) {
  const uniquePaths = [...new Set(objectPaths.filter(Boolean))];
  await Promise.all(uniquePaths.map((objectPath) => deleteChapterIllustrationObject(objectPath)));
}
