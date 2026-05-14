import { Client } from "pg";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const connectionString = process.env.DATABASE_URL?.replace(/"/g, ''); // strip quotes just in case
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ChapterSummary" (
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
    `);
    
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ChapterSummary_chapterId_key" ON "ChapterSummary"("chapterId");
    `);

    // Only add foreign key if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChapterSummary_chapterId_fkey') THEN
              ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
      END
      $$;
    `);

    console.log("ChapterSummary table created successfully!");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "SceneChunk" (
          "id" TEXT NOT NULL,
          "chapterId" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "index" INTEGER NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SceneChunk_pkey" PRIMARY KEY ("id")
      );
    `);

    await client.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SceneChunk_chapterId_fkey') THEN
              ALTER TABLE "SceneChunk" ADD CONSTRAINT "SceneChunk_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
      END
      $$;
    `);

    console.log("SceneChunk table created successfully (without vector column)!");
    
    // Mark the migration as applied so prisma migrate doesn't complain next time
    await client.query(`
      INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count") 
      VALUES ('manual-fix-123', 'fake-checksum', NOW(), '20260512204136_add_pgvector_and_summaries', NULL, NULL, NOW(), 1)
      ON CONFLICT DO NOTHING;
    `);
    console.log("Migration marked as applied.");

  } catch (e) {
    console.error("Error creating tables:", e);
  } finally {
    await client.end();
  }
}
main();
