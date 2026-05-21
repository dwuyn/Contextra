-- CreateTable
CREATE TABLE "CanonEntity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "vector" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityId" TEXT,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "branchId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "vector" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonRelation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "targetEntityId" TEXT,
    "relationType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "vector" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryArc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "startChapterIndex" INTEGER,
    "endChapterIndex" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutlineBeat" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "arcId" TEXT,
    "chapterIndex" INTEGER,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "focusEntities" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutlineBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonProposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "branchId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "CanonProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanonEntity_projectId_type_idx" ON "CanonEntity"("projectId", "type");

-- CreateIndex
CREATE INDEX "CanonEntity_projectId_name_idx" ON "CanonEntity"("projectId", "name");

-- CreateIndex
CREATE INDEX "CanonFact_projectId_status_idx" ON "CanonFact"("projectId", "status");

-- CreateIndex
CREATE INDEX "CanonFact_projectId_kind_idx" ON "CanonFact"("projectId", "kind");

-- CreateIndex
CREATE INDEX "CanonFact_entityId_idx" ON "CanonFact"("entityId");

-- CreateIndex
CREATE INDEX "CanonFact_sourceChapterId_idx" ON "CanonFact"("sourceChapterId");

-- CreateIndex
CREATE INDEX "CanonRelation_projectId_status_idx" ON "CanonRelation"("projectId", "status");

-- CreateIndex
CREATE INDEX "CanonRelation_projectId_relationType_idx" ON "CanonRelation"("projectId", "relationType");

-- CreateIndex
CREATE INDEX "CanonRelation_sourceEntityId_idx" ON "CanonRelation"("sourceEntityId");

-- CreateIndex
CREATE INDEX "CanonRelation_targetEntityId_idx" ON "CanonRelation"("targetEntityId");

-- CreateIndex
CREATE INDEX "StoryArc_projectId_sortOrder_idx" ON "StoryArc"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "StoryArc_projectId_startChapterIndex_endChapterIndex_idx" ON "StoryArc"("projectId", "startChapterIndex", "endChapterIndex");

-- CreateIndex
CREATE INDEX "OutlineBeat_projectId_chapterIndex_idx" ON "OutlineBeat"("projectId", "chapterIndex");

-- CreateIndex
CREATE INDEX "OutlineBeat_arcId_idx" ON "OutlineBeat"("arcId");

-- CreateIndex
CREATE INDEX "CanonProposal_projectId_status_idx" ON "CanonProposal"("projectId", "status");

-- CreateIndex
CREATE INDEX "CanonProposal_chapterId_idx" ON "CanonProposal"("chapterId");

-- AddForeignKey
ALTER TABLE "CanonEntity" ADD CONSTRAINT "CanonEntity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonFact" ADD CONSTRAINT "CanonFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonFact" ADD CONSTRAINT "CanonFact_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CanonEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonFact" ADD CONSTRAINT "CanonFact_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonRelation" ADD CONSTRAINT "CanonRelation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonRelation" ADD CONSTRAINT "CanonRelation_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "CanonEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonRelation" ADD CONSTRAINT "CanonRelation_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "CanonEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonRelation" ADD CONSTRAINT "CanonRelation_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryArc" ADD CONSTRAINT "StoryArc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlineBeat" ADD CONSTRAINT "OutlineBeat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlineBeat" ADD CONSTRAINT "OutlineBeat_arcId_fkey" FOREIGN KEY ("arcId") REFERENCES "StoryArc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonProposal" ADD CONSTRAINT "CanonProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonProposal" ADD CONSTRAINT "CanonProposal_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
