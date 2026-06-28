import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    continuityJob: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never);
  });

  it("reports syncing while queued work is still fresh and keeps collaboration disabled", async () => {
    vi.mocked(prisma.continuityJob.groupBy).mockResolvedValue([
      { status: "queued", _count: { _all: 2 } },
    ] as never);
    vi.mocked(prisma.continuityJob.count)
      .mockResolvedValueOnce(0 as never)
      .mockResolvedValueOnce(0 as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("syncing");
    expect(data.collaborationPersistence).toEqual({
      status: "disabled",
      lastError: null,
    });
    expect(data.continuityJobs).toEqual({
      queued: 2,
      processing: 0,
      done: 0,
      failed: 0,
      staleProcessing: 0,
      staleQueued: 0,
    });
  });

  it("reports degraded when queued jobs have gone stale", async () => {
    vi.mocked(prisma.continuityJob.groupBy).mockResolvedValue([
      { status: "queued", _count: { _all: 1 } },
    ] as never);
    vi.mocked(prisma.continuityJob.count)
      .mockResolvedValueOnce(0 as never)
      .mockResolvedValueOnce(1 as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("degraded");
    expect(data.collaborationPersistence.status).toBe("disabled");
    expect(data.continuityJobs.staleQueued).toBe(1);
  });

  it("returns 503 on database failure and still reports collaboration disabled", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("db down"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.database).toBe("unhealthy");
    expect(data.collaborationPersistence).toEqual({
      status: "disabled",
      lastError: null,
    });
    expect(data.error).toBe("db down");
  });
});
