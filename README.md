# Contextra

## Demo

https://github.com/user-attachments/assets/e869958f-bf27-49a7-93b0-4d067c7a05d0

Link Web [Contextra](https://contextra.dwyn.id.vn/en)

Contextra is a collaborative writing workspace for long-form fiction. It combines a chapter editor, story bible, branching/version history, AI-assisted drafting, continuity memory, and shared project workflows like presence, comments, invites, and saved-chapter notifications in a single Next.js app.

## Tech Stack

- Next.js 16 with the App Router and React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7 with PostgreSQL 16 and `pgvector`
- Vercel AI SDK with Google Vertex AI
- Google Cloud Text-to-Speech for voice-reader features
- Zustand for client state
- Tiptap for the editor
- Vitest for tests

## Local Setup

### Prerequisites

- Node.js 22 LTS recommended
- npm
- PostgreSQL 16+ with the `vector` extension available
- Google Cloud project access for AI features
- Optional: Redis for multi-instance SSE fan-out

### 1. Install dependencies

```bash
npm install
```

### 2. Create your env file

```bash
cp .env.example .env
```

Minimum values to review in `.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`

### 3. Prepare the database

Create the database, make sure `pgvector` is installed, then run migrations:

```bash
npx prisma migrate dev
```

### 4. Start the app

For full functionality, start the Next.js dev server and the continuity memory worker in separate terminals:

```bash
npm run dev                  # Start Next.js dev server (port 3000)
npm run worker:continuity    # Start continuity memory worker (required)
```

Open `http://localhost:3000`.

### Useful commands

```bash
npm run dev
npm run build
npm run lint
npx vitest
npx prisma generate
npm run reembed:ai
npm run worker:continuity:once
```

## Docker Setup

The repo ships a multi-stage Docker build with separate `runner` and `migrator` targets. `docker-compose.yml` supports both:

- local image builds from the checked-out repo
- tagged GHCR images for deployment

### 1. Create your env file

```bash
cp .env.example .env
```

`docker-compose.yml` injects its own container-to-container `DATABASE_URL`, so the host-based value in `.env` is only used for local non-Docker development.

### 2. Build the app images

```bash
docker compose build next-app migrate
```

### 3. Start Postgres

```bash
docker compose up -d postgres
```

### 4. Run Prisma migrations

```bash
docker compose run --rm migrate
```

### 5. Start the app

```bash
docker compose up -d next-app
```

Open `http://localhost:3000` by default. If you set `APP_PORT` in `.env`, use that port instead.

### Optional Google credentials in Docker

If you want AI or TTS features from inside the containers, standard Google Cloud authentication uses Application Default Credentials (ADC) or a service-account key. You can mount a service-account key into the app and migrator containers and point `GOOGLE_APPLICATION_CREDENTIALS` at the in-container path, for example `/app/google-key.json`.

For Google Cloud Text-to-Speech:
- Standard Cloud TTS API is used for speech synthesis and voice listing.
- The voice reader only exposes `Neural2` voices.
- Authenticate via `GOOGLE_APPLICATION_CREDENTIALS` or ADC when deployed.
- Cached audio segments are persisted in the GCS bucket specified by `GOOGLE_TTS_CACHE_BUCKET`.

### Stop the stack

```bash
docker compose down
```

## Project Structure

- `src/app/`: App Router pages, route handlers, locale routing, and API endpoints
- `src/actions/`: Server actions for auth, projects, AI, export, people, friends, and pronunciation
- `src/components/`: Main UI surfaces such as the editor, dashboard, collaboration panels, and modals
- `src/services/`: Business logic for AI, RAG, continuity, auth, projects, collaboration, and TTS
- `src/lib/`: Shared infrastructure including auth helpers, Prisma, i18n, validation, avatar storage, and realtime utilities
- `src/store/`: Zustand stores for preferences, project state, and zen mode
- `src/messages/`: Translation message files
- `src/types/`: Shared TypeScript types
- `prisma/`: Prisma schema and migration history
- `scripts/`: One-off workers and maintenance scripts

## Notes

- Production builds use `output: "standalone"` in Next.js.
- Avatar uploads are stored under `/app/data` in Docker and persisted with a named volume.
- Redis is optional and only needed when realtime SSE events must fan out across multiple app instances.
- Shared editing uses normal saves with stale-write protection plus SSE notifications, not live document transport.

## License

Private project for personal or internal use.

## Example novel:
<img width="1895" height="943" alt="image" src="https://github.com/user-attachments/assets/f2a0eb3d-9223-42a2-be81-d95132702960" />

## Tỷ lệ đóng góp:
- 24521208 - Trần Đình Nguyên: 50%
- 24521675 - Đinh Quốc Thịnh: 50%

### Chúng em đã biết làm web và hiểu hệ thống web hoạt động như thế nào.
