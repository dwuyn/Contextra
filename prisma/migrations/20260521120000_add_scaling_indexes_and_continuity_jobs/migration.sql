-- CreateTable
CREATE TABLE "ContinuityJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'chapter_continuity',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContinuityJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_projectId_name_idx" ON "Character"("projectId", "name");

-- CreateIndex
CREATE INDEX "Chapter_projectId_branchId_index_idx" ON "Chapter"("projectId", "branchId", "index");

-- CreateIndex
CREATE INDEX "Chapter_projectId_index_idx" ON "Chapter"("projectId", "index");

-- CreateIndex
CREATE INDEX "CanonFact_projectId_status_importance_updatedAt_idx" ON "CanonFact"("projectId", "status", "importance", "updatedAt");

-- CreateIndex
CREATE INDEX "CanonRelation_projectId_status_updatedAt_idx" ON "CanonRelation"("projectId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ContinuityJob_status_runAfter_idx" ON "ContinuityJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "ContinuityJob_type_status_runAfter_idx" ON "ContinuityJob"("type", "status", "runAfter");

-- CreateIndex
CREATE INDEX "ContinuityJob_chapterId_type_status_idx" ON "ContinuityJob"("chapterId", "type", "status");

-- CreateIndex
CREATE INDEX "ContinuityJob_projectId_status_idx" ON "ContinuityJob"("projectId", "status");

-- CreateIndex
CREATE INDEX "SceneChunk_chapterId_index_idx" ON "SceneChunk"("chapterId", "index");

-- Vector ANN indexes for RAG/canon retrieval. pgvector must already be installed by earlier migrations.
CREATE INDEX "SceneChunk_vector_hnsw_idx" ON "SceneChunk" USING hnsw ("vector" vector_l2_ops);
CREATE INDEX "CanonFact_vector_hnsw_idx" ON "CanonFact" USING hnsw ("vector" vector_l2_ops);
CREATE INDEX "CanonEntity_vector_hnsw_idx" ON "CanonEntity" USING hnsw ("vector" vector_l2_ops);
CREATE INDEX "CanonRelation_vector_hnsw_idx" ON "CanonRelation" USING hnsw ("vector" vector_l2_ops);

-- AddForeignKey
ALTER TABLE "ContinuityJob" ADD CONSTRAINT "ContinuityJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContinuityJob" ADD CONSTRAINT "ContinuityJob_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
