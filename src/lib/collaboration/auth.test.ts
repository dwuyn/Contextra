import { afterEach, describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { createCollaborationToken, verifyCollaborationToken } from "@/lib/collaboration/auth";

describe("collaboration auth", () => {
  afterEach(() => {
    delete process.env.COLLAB_JWT_SECRET;
  });

  it("round-trips collaboration tokens", async () => {
    process.env.COLLAB_JWT_SECRET = "test-collaboration-secret";

    const token = await createCollaborationToken({
      userId: "user-1",
      projectId: "project-1",
      chapterId: "chapter-1",
      name: "Editor",
      profileImageUrl: null,
      readOnly: false,
    });

    await expect(verifyCollaborationToken(token)).resolves.toMatchObject({
      userId: "user-1",
      projectId: "project-1",
      chapterId: "chapter-1",
      name: "Editor",
      readOnly: false,
    });
  });

  it("issues tokens that stay valid for 24 hours", async () => {
    process.env.COLLAB_JWT_SECRET = "test-collaboration-secret";

    const token = await createCollaborationToken({
      userId: "user-1",
      projectId: "project-1",
      chapterId: "chapter-1",
      name: "Editor",
      profileImageUrl: null,
      readOnly: false,
    });

    const payload = decodeJwt(token);
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
    expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);
  });
});
