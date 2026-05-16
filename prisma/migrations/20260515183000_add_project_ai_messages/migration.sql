-- CreateTable
CREATE TABLE "ProjectAiMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectAiMessage_projectId_createdAt_idx" ON "ProjectAiMessage"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectAiMessage" ADD CONSTRAINT "ProjectAiMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
