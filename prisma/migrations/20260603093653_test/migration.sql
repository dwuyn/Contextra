/*
  Warnings:

  - A unique constraint covering the columns `[senderId,receiverId]` on the table `FriendRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "CanonEntity_vector_hnsw_idx";

-- DropIndex
DROP INDEX "CanonFact_vector_hnsw_idx";

-- DropIndex
DROP INDEX "CanonRelation_vector_hnsw_idx";

-- DropIndex
DROP INDEX "SceneChunk_vector_hnsw_idx";

-- AlterTable
ALTER TABLE "CanonRelation" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "vector" vector(768);

-- AlterTable
ALTER TABLE "StoryArc" ADD COLUMN     "arcSummary" TEXT;

-- CreateTable
CREATE TABLE "PronunciationEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "replacement" TEXT NOT NULL,
    "renderMode" TEXT NOT NULL,
    "matchMode" TEXT NOT NULL,
    "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PronunciationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PronunciationEntry_projectId_language_enabled_priority_idx" ON "PronunciationEntry"("projectId", "language", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "PronunciationEntry_projectId_language_term_matchMode_key" ON "PronunciationEntry"("projectId", "language", "term", "matchMode");

-- CreateIndex
CREATE INDEX "ChapterVersion_projectId_chapterId_createdAt_idx" ON "ChapterVersion"("projectId", "chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_senderId_receiverId_createdAt_idx" ON "DirectMessage"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_senderId_receiverId_key" ON "FriendRequest"("senderId", "receiverId");

-- AddForeignKey
ALTER TABLE "PronunciationEntry" ADD CONSTRAINT "PronunciationEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
