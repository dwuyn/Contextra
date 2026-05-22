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
- Vercel AI SDK with Google Cloud Vertex AI (`gemini-2.5-flash` for chat, `gemini-embedding-001` for embeddings)
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
- Google Cloud project with Vertex AI API enabled
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

5. Configure your Google Cloud project and location in `.env`.

6. After deploying the AI provider migration, re-embed all existing vectors:

   ```bash
   npm run reembed:ai
   ```

7. Start the dev server:

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

## Docker and Compose

The repository now includes a production-style Docker setup that can bring up the app with PostgreSQL + `pgvector`, run Prisma migrations, and then start the Next.js server.

### Compose startup

1. Create your env file:

   ```bash
   cp .env.example .env
   ```

2. Start the stack:

   ```bash
   docker compose up --build
   ```

3. Open `http://localhost:3000`.

If port `3000` is already in use on your machine, set `APP_PORT` in `.env` to another value such as `3001` and then open `http://localhost:<APP_PORT>`.

### What the stack does

- Runs Postgres 16 with `pgvector` available
- Waits for the database health check to pass
- Runs `prisma migrate deploy`
- Starts the standalone Next.js server on port `3000`
- Keeps Postgres on the internal Compose network by default so it does not fight with an existing local database on port `5432`

### Notes

- Google Cloud auth works automatically via ADC when deployed on Google Cloud. For local Docker development, mount your service account key and set `GOOGLE_APPLICATION_CREDENTIALS` to the in-container path.
- Google TTS remains optional. If you want voice-reader features in Docker, mount the service-account key into the app container and set `GOOGLE_APPLICATION_CREDENTIALS` to the in-container path.

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
