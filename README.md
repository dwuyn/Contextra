# Contextra

Contextra is a collaborative, AI-assisted writing workspace for long-form fiction. The current codebase combines a Tiptap editor, story bible tools, branch-aware context assembly, chapter memory/RAG, and lightweight collaboration features in a Next.js 16 app.

## What is implemented

- Email/password auth with JWT cookie sessions
- Project dashboard for personal and public projects
- Tiptap chapter editor with autosave, manual checkpoints, version restore, markdown export, and in-browser voice playback
- Story Bible editing for project summary, genre, synopsis, world rules, characters, and outline
- Branch creation/merge and per-branch chapter ordering
- AI actions for chapter generation, rewrite, sensory expansion, synopsis generation, outline generation, and project chat
- Continuity memory that summarizes saved chapters and stores vectorized scene chunks for semantic retrieval
- Collaboration features including friends, direct messages, project invites, permission levels, live presence, and inline comment threads
- SSE-based realtime updates, with optional Redis fan-out for multi-instance deployments

## Tech stack

- Next.js 16, React 19, App Router
- Tailwind CSS 4
- Prisma 7 with PostgreSQL
- `pgvector` for semantic retrieval
- Vercel AI SDK with an OpenAI-compatible API endpoint
- Zustand for client state
- Tiptap for the editor

## AI context flow

When AI features run, the app currently builds context from:

1. Project metadata and story bible fields
2. Branch lineage and recent chapter summaries
3. The latest chapter text window
4. Semantic search hits from saved `SceneChunk` embeddings

This logic lives primarily in `src/services/contextService.ts`, `src/services/memoryService.ts`, and `src/services/ragService.ts`.

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ with the `vector` extension available
- An OpenAI-compatible chat + embedding endpoint reachable from the app
- Optional: Redis if you want distributed realtime events

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local env file:

   ```bash
   cp .env.example .env
   ```

3. Create the database and make sure `pgvector` is installed for that Postgres instance.

4. Run Prisma migrations:

   ```bash
   npx prisma migrate dev
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`.

### Useful commands

```bash
npm run dev
npm run lint
npm run build
```

## Docker and Compose notes

This repository includes a `Dockerfile` and `docker-compose.yml`, but the Compose stack is not a complete one-command development environment as committed.

- `docker-compose.yml` expects `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `JWT_SECRET`
- The Compose Postgres service uses `postgres:16-alpine`, which does not provide `pgvector` by default
- The app's RAG and continuity pipeline depend on `CREATE EXTENSION vector`
- Prisma migrations are not automatically executed by the runtime container
- If your AI service runs on the host machine, `localhost` or `127.0.0.1` from inside the app container will not reach it; use a container-reachable URL instead

If you want Docker-based development, use a Postgres image with `pgvector` preinstalled or install the extension before running migrations.

## Project structure

- `src/app`: App Router routes and API handlers
- `src/actions`: server actions
- `src/components`: UI and editor surfaces
- `src/services`: business logic, AI, RAG, continuity, auth, and collaboration services
- `src/lib`: shared libraries, auth helpers, Prisma client, realtime transport, and Tiptap extensions
- `src/store`: Zustand client state
- `prisma`: schema and migrations

## License

Private project for personal/internal use.
