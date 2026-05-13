-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "SceneChunk" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector" vector(768),
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyEvents" JSONB NOT NULL,
    "factsLearned" JSONB NOT NULL,
    "characters" JSONB NOT NULL,
    "emotional" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSummary_chapterId_key" ON "ChapterSummary"("chapterId");

-- AddForeignKey
ALTER TABLE "SceneChunk" ADD CONSTRAINT "SceneChunk_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
