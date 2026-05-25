-- Drop existing L2 distance HNSW indexes (incompatible with cosine distance queries)
DROP INDEX IF EXISTS "SceneChunk_vector_hnsw_idx";
DROP INDEX IF EXISTS "CanonFact_vector_hnsw_idx";
DROP INDEX IF EXISTS "CanonEntity_vector_hnsw_idx";
DROP INDEX IF EXISTS "CanonRelation_vector_hnsw_idx";

-- Recreate HNSW indexes with cosine distance operator class (matches <=> queries)
CREATE INDEX "SceneChunk_vector_hnsw_idx" ON "SceneChunk" USING hnsw ("vector" vector_cosine_ops);
CREATE INDEX "CanonFact_vector_hnsw_idx" ON "CanonFact" USING hnsw ("vector" vector_cosine_ops);
CREATE INDEX "CanonEntity_vector_hnsw_idx" ON "CanonEntity" USING hnsw ("vector" vector_cosine_ops);
CREATE INDEX "CanonRelation_vector_hnsw_idx" ON "CanonRelation" USING hnsw ("vector" vector_cosine_ops);
