import { readAvatarFile } from "@/lib/avatarStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; filename: string }> },
) {
  const { userId, filename } = await params;

  try {
    const avatar = await readAvatarFile(userId, filename);

    return new Response(avatar.buffer, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(avatar.buffer.byteLength),
        "Content-Type": avatar.contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load avatar.";

    if (message === "Avatar not found" || message === "Invalid avatar path") {
      return new Response("Not found", { status: 404 });
    }

    console.error("Failed to load avatar:", error);
    return new Response("Failed to load avatar.", { status: 500 });
  }
}
