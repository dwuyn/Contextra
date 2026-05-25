import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));

import { GET } from "./route";
import { readFile } from "node:fs/promises";

vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AVATAR_STORAGE_DIR = "/tmp/avatars";
});

describe("GET /api/avatars/[userId]/[filename]", () => {
  it("returns the avatar bytes with cache headers", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from("avatar"));

    const response = await GET(new Request("http://localhost/api/avatars/user-001/avatar.jpg"), {
      params: Promise.resolve({ userId: "user-001", filename: "avatar.jpg" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from("avatar"))).toBe(true);
  });

  it("returns 404 when the file does not exist", async () => {
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("Missing"), { code: "ENOENT" }),
    );

    const response = await GET(new Request("http://localhost/api/avatars/user-001/avatar.png"), {
      params: Promise.resolve({ userId: "user-001", filename: "avatar.png" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejects invalid path segments before touching the filesystem", async () => {
    const response = await GET(new Request("http://localhost/api/avatars/../avatar.png"), {
      params: Promise.resolve({ userId: "..", filename: "avatar.png" }),
    });

    expect(response.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });
});
