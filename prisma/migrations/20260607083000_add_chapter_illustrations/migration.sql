ALTER TABLE "Chapter"
ADD COLUMN "illustrationObjectPath" TEXT,
ADD COLUMN "illustrationMimeType" TEXT,
ADD COLUMN "illustrationPrompt" TEXT,
ADD COLUMN "illustrationModel" TEXT,
ADD COLUMN "illustrationGeneratedAt" TIMESTAMP(3);
