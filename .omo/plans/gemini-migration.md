# Gemini AI Backend Migration Plan

## Summary
- Replace the current OpenAI-compatible AI SDK provider with Google Cloud Vertex AI via `@ai-sdk/google-vertex`.
- Use `gemini-2.5-flash` for chat/generation and `gemini-embedding-001` for embeddings.
- Keep the existing `pgvector` schema at `vector(768)` by configuring Gemini embeddings with `outputDimensionality: 768`.
- Re-embed all existing RAG and canon vectors because the current Nomic vectors are not compatible with Gemini embeddings.

## Key Changes
- Update dependencies in `package.json`:
  - Add `@ai-sdk/google-vertex`.
  - Remove unused `@ai-sdk/openai`.
  - Remove unused `@openrouter/ai-sdk-provider`.
  - Regenerate `package-lock.json`.

- Replace `src/lib/ai.ts`:
  - Use `createVertex` from `@ai-sdk/google-vertex`.
  - Read `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL`, and `AI_EMBEDDING_DIMENSIONS`.
  - Export shared chat and embedding model helpers.
  - Fail clearly if required Google Cloud config is missing.

- Update all hard-coded chat model call sites:
  - `src/services/aiService.ts`
  - `src/services/memoryService.ts`
  - `src/services/canonService.ts`
  - `src/app/api/chat/route.ts`
  - `src/app/api/project-ai-chat/route.ts`

- Update embeddings in `src/services/ragService.ts`:
  - Replace `customAi.embedding("nomic-embed-text")` with the Gemini embedding model.
  - Pass `outputDimensionality: 768`.
  - Use `RETRIEVAL_DOCUMENT` for stored content and `RETRIEVAL_QUERY` for search queries.
  - Validate embedding length before writing to `pgvector`.

- Reduce data-loss risk during re-indexing:
  - Generate all chapter chunk embeddings before deleting existing `SceneChunk` rows.
  - Only replace rows after the new embeddings succeed.

- Add explicit Node runtime to streaming AI routes:
  - `src/app/api/chat/route.ts`
  - `src/app/api/project-ai-chat/route.ts`
  - Keep these routes on `nodejs`, not edge.

## Env And Docs
- Clean `.env.example`:
```dotenv
DATABASE_URL=postgresql://contextra:contextra@localhost:5432/contextra?schema=public
POSTGRES_DB=contextra
POSTGRES_USER=contextra
POSTGRES_PASSWORD=contextra
JWT_SECRET=change-me

GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=asia-southeast1
GOOGLE_APPLICATION_CREDENTIALS=./google-key.json

AI_CHAT_MODEL=gemini-2.5-flash
AI_EMBEDDING_MODEL=gemini-embedding-001
AI_EMBEDDING_DIMENSIONS=768

GOOGLE_TTS_CACHE_BUCKET=your-private-audio-cache-bucket
GOOGLE_TTS_CURATED_VOICES_EN=en-US-Chirp3-HD-Aoede,en-US-Chirp3-HD-Charon
GOOGLE_TTS_CURATED_VOICES_VI=vi-VN-Chirp3-HD-Aoede,vi-VN-Chirp3-HD-Charon

APP_PORT=3000
DATABASE_POOL_MAX=10
REDIS_URL=redis://localhost:6379
```

- Clean `.env`:
  - Preserve existing secrets and deployment-specific values.
  - Remove `OPENAI_BASE_URL` and `OPENAI_API_KEY` if present.
  - Remove `SHADOW_DATABASE_URL` unless a future workflow actually uses it.
  - Add `AI_EMBEDDING_DIMENSIONS=768`.
  - Keep existing Google Cloud and TTS values.

- Update `README.md`:
  - Replace OpenAI-compatible endpoint setup with Google Cloud Vertex AI setup.
  - Document the required Google Cloud auth path, model IDs, and re-embedding step.
  - Clarify when `GOOGLE_APPLICATION_CREDENTIALS` is required versus when ADC is enough.

- Review `src/services/googleTtsService.ts`:
  - Stop requiring `GOOGLE_APPLICATION_CREDENTIALS` explicitly if deployed on Google Cloud with ADC.
  - Keep TTS bucket and curated voice env vars required for voice-reader features.

## Data Migration
- Add `scripts/reembed-ai-vectors.ts`.
- Add a package script such as `reembed:ai`.
- The script should:
  - Rebuild all `SceneChunk` vectors from chapter content.
  - Refresh active `CanonEntity` vectors.
  - Refresh approved `CanonFact` vectors.
  - Refresh approved `CanonRelation` vectors.
  - Log counts and exit non-zero on unrecoverable errors.
- No Prisma schema migration is needed if Gemini embeddings are constrained to 768 dimensions.
- Run the re-embedding job after the provider/env migration is deployed.

## Test Plan
- Run `npm install` to update dependencies and lockfile.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run reembed:ai` against a development database.
- Smoke test:
  - Chapter generation
  - Rewrite
  - Selection description
  - Synopsis generation
  - Outline generation
  - `/api/chat`
  - `/api/project-ai-chat`
- Verify semantic search returns useful context after re-embedding.
- Verify voice-reader routes still work with the current Google auth setup.
- Confirm no runtime references remain to `OPENAI_BASE_URL`, `OPENAI_API_KEY`, or `nomic-embed-text`.

## Assumptions
- Use Google Cloud Vertex AI through the AI SDK provider, not the Google Gen AI SDK directly.
- Keep the existing `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` env names.
- Keep `vector(768)` for this migration.
- Rebuild all existing vectors even though the dimension stays the same.
