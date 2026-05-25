import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MANAGED_AVATAR_PATH_PREFIX = "/api/avatars";
export const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
export const ALLOWED_AVATAR_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

type AvatarContentType = (typeof ALLOWED_AVATAR_CONTENT_TYPES)[number];

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const CONTENT_TYPE_TO_EXTENSION: Record<AvatarContentType, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const EXTENSION_TO_CONTENT_TYPE: Record<string, AvatarContentType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function getAvatarStorageRoot() {
  const configuredRoot = process.env.AVATAR_STORAGE_DIR?.trim();
  return path.resolve(configuredRoot || path.join(process.cwd(), "data", "avatars"));
}

function assertSafeSegment(segment: string) {
  if (segment === "." || segment === ".." || !SAFE_SEGMENT_PATTERN.test(segment)) {
    throw new Error("Invalid avatar path");
  }
}

function resolveAvatarPath(userId: string, filename: string) {
  assertSafeSegment(userId);
  assertSafeSegment(filename);

  const storageRoot = getAvatarStorageRoot();
  const resolvedPath = path.resolve(storageRoot, userId, filename);
  const storageRootWithSeparator = storageRoot.endsWith(path.sep)
    ? storageRoot
    : `${storageRoot}${path.sep}`;

  if (!resolvedPath.startsWith(storageRootWithSeparator)) {
    throw new Error("Invalid avatar path");
  }

  return resolvedPath;
}

function getUrlPathname(value: string) {
  return new URL(value, "http://localhost").pathname;
}

function getContentTypeForFilename(filename: string) {
  const contentType = EXTENSION_TO_CONTENT_TYPE[path.extname(filename).toLowerCase()];

  if (!contentType) {
    throw new Error("Invalid avatar path");
  }

  return contentType;
}

export function isManagedAvatarContentType(contentType: string): contentType is AvatarContentType {
  return ALLOWED_AVATAR_CONTENT_TYPES.includes(contentType as AvatarContentType);
}

export function isManagedAvatarUrl(profileImageUrl: string) {
  return getUrlPathname(profileImageUrl).startsWith(`${MANAGED_AVATAR_PATH_PREFIX}/`);
}

export async function storeAvatarFile(input: {
  userId: string;
  contentType: AvatarContentType;
  bytes: ArrayBuffer;
}) {
  const filename = `${randomUUID()}${CONTENT_TYPE_TO_EXTENSION[input.contentType]}`;
  const filePath = resolveAvatarPath(input.userId, filename);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(input.bytes));

  return {
    filePath,
    profileImageUrl: `${MANAGED_AVATAR_PATH_PREFIX}/${encodeURIComponent(input.userId)}/${encodeURIComponent(filename)}`,
  };
}

export async function deleteStoredAvatarFile(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function deleteManagedAvatar(profileImageUrl: string) {
  const pathname = getUrlPathname(profileImageUrl);
  const prefix = `${MANAGED_AVATAR_PATH_PREFIX}/`;

  if (!pathname.startsWith(prefix)) {
    throw new Error("Invalid avatar path");
  }

  const pathSegments = pathname
    .slice(prefix.length)
    .split("/")
    .map((segment) => decodeURIComponent(segment));

  if (pathSegments.length !== 2) {
    throw new Error("Invalid avatar path");
  }

  const [userId, filename] = pathSegments;
  await deleteStoredAvatarFile(resolveAvatarPath(userId, filename));
}

export async function readAvatarFile(userId: string, filename: string) {
  const filePath = resolveAvatarPath(userId, filename);
  const contentType = getContentTypeForFilename(filename);

  try {
    const buffer = await readFile(filePath);
    return { buffer, contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Avatar not found");
    }

    throw error;
  }
}
