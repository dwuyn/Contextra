import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/authService", () => ({
  setProfileImage: vi.fn(),
}));

vi.mock("@/lib/avatarStorage", () => ({
  MAX_AVATAR_FILE_SIZE: 5 * 1024 * 1024,
  deleteManagedAvatar: vi.fn(),
  deleteStoredAvatarFile: vi.fn(),
  isManagedAvatarContentType: vi.fn(),
  isManagedAvatarUrl: vi.fn(),
  storeAvatarFile: vi.fn(),
}));

import { POST } from "./route";
import { getSession } from "@/lib/auth";
import {
  MAX_AVATAR_FILE_SIZE,
  deleteManagedAvatar,
  deleteStoredAvatarFile,
  isManagedAvatarContentType,
  isManagedAvatarUrl,
  storeAvatarFile,
} from "@/lib/avatarStorage";
import { setProfileImage } from "@/services/authService";

vi.spyOn(console, "error").mockImplementation(() => {});

function makeRequest(file?: File) {
  const formData = new FormData();

  if (file) {
    formData.append("file", file);
  }

  return new Request("http://localhost/api/account/avatar", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: "user-001",
    email: "user@example.com",
    name: "User",
  });
  (isManagedAvatarContentType as ReturnType<typeof vi.fn>).mockImplementation(
    (contentType: string) => contentType === "image/png",
  );
  (storeAvatarFile as ReturnType<typeof vi.fn>).mockResolvedValue({
    filePath: "/tmp/avatars/user-001/avatar.png",
    profileImageUrl: "/api/avatars/user-001/avatar.png",
  });
  (setProfileImage as ReturnType<typeof vi.fn>).mockResolvedValue({
    previousProfileImageUrl: null,
    profileImageUrl: "/api/avatars/user-001/avatar.png",
  });
  (isManagedAvatarUrl as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (deleteManagedAvatar as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (deleteStoredAvatarFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("POST /api/account/avatar", () => {
  it("returns 401 when the user is not authenticated", async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
  });

  it("returns 400 when no file was provided", async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain("Please choose an image file");
  });

  it("returns 400 for unsupported file types", async () => {
    const response = await POST(
      makeRequest(new File(["avatar"], "avatar.gif", { type: "image/gif" })),
    );

    expect(response.status).toBe(400);
    expect(storeAvatarFile).not.toHaveBeenCalled();
  });

  it("returns 400 for files larger than 5 MB", async () => {
    const response = await POST(
      makeRequest(
        new File([new Uint8Array(MAX_AVATAR_FILE_SIZE + 1)], "avatar.png", {
          type: "image/png",
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(storeAvatarFile).not.toHaveBeenCalled();
  });

  it("stores the file and returns the new avatar URL", async () => {
    const response = await POST(
      makeRequest(new File(["avatar"], "avatar.png", { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profileImageUrl: "/api/avatars/user-001/avatar.png",
    });
    expect(storeAvatarFile).toHaveBeenCalled();
    expect(setProfileImage).toHaveBeenCalledWith(
      "user-001",
      "/api/avatars/user-001/avatar.png",
    );
  });

  it("cleans up the new file if updating the user record fails", async () => {
    (setProfileImage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB failed"));

    const response = await POST(
      makeRequest(new File(["avatar"], "avatar.png", { type: "image/png" })),
    );

    expect(response.status).toBe(500);
    expect(deleteStoredAvatarFile).toHaveBeenCalledWith(
      "/tmp/avatars/user-001/avatar.png",
    );
  });

  it("deletes the previous managed avatar after a successful replace", async () => {
    (setProfileImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      previousProfileImageUrl: "/api/avatars/user-001/old.png",
      profileImageUrl: "/api/avatars/user-001/avatar.png",
    });

    const response = await POST(
      makeRequest(new File(["avatar"], "avatar.png", { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    expect(deleteManagedAvatar).toHaveBeenCalledWith("/api/avatars/user-001/old.png");
  });

  it("does not delete previous avatars that are outside the managed path", async () => {
    (setProfileImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      previousProfileImageUrl: "https://cdn.example.com/avatar.png",
      profileImageUrl: "/api/avatars/user-001/avatar.png",
    });
    (isManagedAvatarUrl as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const response = await POST(
      makeRequest(new File(["avatar"], "avatar.png", { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    expect(deleteManagedAvatar).not.toHaveBeenCalled();
  });

  it("treats previous-avatar deletion as best effort", async () => {
    (setProfileImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      previousProfileImageUrl: "/api/avatars/user-001/old.png",
      profileImageUrl: "/api/avatars/user-001/avatar.png",
    });
    (deleteManagedAvatar as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("unlink failed"),
    );

    const response = await POST(
      makeRequest(new File(["avatar"], "avatar.png", { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    expect(deleteStoredAvatarFile).not.toHaveBeenCalled();
  });
});
