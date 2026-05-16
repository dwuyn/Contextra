-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "outline" JSONB NOT NULL DEFAULT '{"acts": []}';
