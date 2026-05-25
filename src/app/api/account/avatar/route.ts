import { getSession } from "@/lib/auth";
import {
  MAX_AVATAR_FILE_SIZE,
  deleteManagedAvatar,
  deleteStoredAvatarFile,
  isManagedAvatarContentType,
  isManagedAvatarUrl,
  storeAvatarFile,
} from "@/lib/avatarStorage";
import * as authService from "@/services/authService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let storedAvatar: { filePath: string; profileImageUrl: string } | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return new Response("Please choose an image file to upload.", { status: 400 });
    }

    if (!isManagedAvatarContentType(file.type)) {
      return new Response("Avatar must be a PNG, JPEG, or WEBP image.", { status: 400 });
    }

    if (file.size > MAX_AVATAR_FILE_SIZE) {
      return new Response("Avatar must be 5 MB or smaller.", { status: 400 });
    }

    storedAvatar = await storeAvatarFile({
      userId: session.userId,
      contentType: file.type,
      bytes: await file.arrayBuffer(),
    });

    const result = await authService.setProfileImage(session.userId, storedAvatar.profileImageUrl);
    storedAvatar = null;

    if (result.previousProfileImageUrl && isManagedAvatarUrl(result.previousProfileImageUrl)) {
      try {
        await deleteManagedAvatar(result.previousProfileImageUrl);
      } catch (error) {
        console.error("Failed to delete previous avatar:", error);
      }
    }

    return Response.json({ profileImageUrl: result.profileImageUrl });
  } catch (error) {
    if (storedAvatar) {
      await deleteStoredAvatarFile(storedAvatar.filePath);
    }

    console.error("Failed to upload avatar:", error);

    const message = error instanceof Error ? error.message : "Failed to upload avatar.";
    const status = message === "User not found" ? 404 : 500;

    return new Response(message, { status });
  }
}
