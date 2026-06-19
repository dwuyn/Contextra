CREATE TABLE "ChapterCollaborationState" (
    "chapterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterCollaborationState_pkey" PRIMARY KEY ("chapterId")
);

CREATE INDEX "ChapterCollaborationState_projectId_updatedAt_idx" ON "ChapterCollaborationState"("projectId", "updatedAt");

ALTER TABLE "ChapterCollaborationState"
ADD CONSTRAINT "ChapterCollaborationState_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChapterCollaborationState"
ADD CONSTRAINT "ChapterCollaborationState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
