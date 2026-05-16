-- Add collaboration primitives for invites, live presence, and comments.

ALTER TABLE "Collaborator"
ADD CONSTRAINT "Collaborator_projectId_userId_key" UNIQUE ("projectId", "userId");

CREATE TABLE "ProjectInvite" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "receiverUserId" TEXT NOT NULL,
    "permissionLevel" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectPresence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'viewing',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPresence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "selectedText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentReply" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectInvite_projectId_status_idx" ON "ProjectInvite"("projectId", "status");
CREATE INDEX "ProjectInvite_receiverUserId_status_idx" ON "ProjectInvite"("receiverUserId", "status");
CREATE INDEX "ProjectInvite_senderUserId_status_idx" ON "ProjectInvite"("senderUserId", "status");

CREATE UNIQUE INDEX "ProjectPresence_projectId_userId_key" ON "ProjectPresence"("projectId", "userId");
CREATE INDEX "ProjectPresence_projectId_lastActiveAt_idx" ON "ProjectPresence"("projectId", "lastActiveAt");
CREATE INDEX "ProjectPresence_chapterId_lastActiveAt_idx" ON "ProjectPresence"("chapterId", "lastActiveAt");

CREATE INDEX "CommentThread_projectId_chapterId_status_idx" ON "CommentThread"("projectId", "chapterId", "status");
CREATE INDEX "CommentThread_chapterId_updatedAt_idx" ON "CommentThread"("chapterId", "updatedAt");

CREATE INDEX "CommentReply_threadId_createdAt_idx" ON "CommentReply"("threadId", "createdAt");

ALTER TABLE "ProjectInvite"
ADD CONSTRAINT "ProjectInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectInvite"
ADD CONSTRAINT "ProjectInvite_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectInvite"
ADD CONSTRAINT "ProjectInvite_receiverUserId_fkey" FOREIGN KEY ("receiverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectPresence"
ADD CONSTRAINT "ProjectPresence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectPresence"
ADD CONSTRAINT "ProjectPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectPresence"
ADD CONSTRAINT "ProjectPresence_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommentThread"
ADD CONSTRAINT "CommentThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentThread"
ADD CONSTRAINT "CommentThread_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentThread"
ADD CONSTRAINT "CommentThread_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommentThread"
ADD CONSTRAINT "CommentThread_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommentReply"
ADD CONSTRAINT "CommentReply_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentReply"
ADD CONSTRAINT "CommentReply_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
