# Contextra

Contextra is a sophisticated, AI-powered long-form story management platform. Designed for novelists and creative writers, it solves the "infinite context" problem by using advanced context engineering to maintain story continuity across hundreds of thousands of words.

## 🚀 Key Features

- **Long Context Architecture**: Implements a 5-layer context engine that dynamically assembles relevant story data (Story Bible, character states, recent prose) for LLMs within a fixed token window.
- **Semantic Search (RAG)**: Leverages `pgvector` to perform semantic search across "Scene Chunks," allowing the AI to recall specific past events from distant chapters.
- **Comprehensive Story Bible**: Manage characters, world-building rules, and project metadata (genre, tone, audience) in one centralized location.
- **Dynamic Character State**: Tracks character evolution chapter-by-chapter, ensuring consistency in traits and motivations as the story progresses.
- **Branching Narratives**: Support for versioning and story branches, allowing writers to explore different plot directions without losing progress.
- **Modern Writing Interface**: A rich text editor powered by Tiptap, featuring AI-assisted rewriting, sensory expansion, and chapter auto-summarization.
- **Real-time Synchronization**: Built with Server-Sent Events (SSE) for responsive updates and collaborative potential.

## 🛠️ Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org) (App Router, React 19), [Tailwind CSS 4](https://tailwindcss.com)
- **Editor**: [Tiptap](https://tiptap.dev)
- **Database**: [PostgreSQL](https://www.postgresql.org) with [pgvector](https://github.com/pgvector/pgvector)
- **ORM**: [Prisma](https://www.prisma.io)
- **AI Integration**: [Vercel AI SDK](https://sdk.vercel.ai), [Ollama](https://ollama.com)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs)
- **Authentication**: JWT-based via `jose` and `bcryptjs`

## 📦 Getting Started

### Prerequisites

- **Node.js**: v20 or higher.
- **PostgreSQL**: v16+ with the `pgvector` extension installed.
- **Ollama**: Running locally with the following models:
  - `gemma4:31b` (or your preferred LLM)
  - `nomic-embed-text` (for embeddings)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/dwuyn/contextra.git
    cd contextra
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up Environment Variables**:
    Copy the example environment file and fill in your database and AI configuration.
    ```bash
    cp .env.example .env
    ```

4.  **Database Migration**:
    Run Prisma migrations to set up your schema and the `pgvector` extension.
    ```bash
    npx prisma migrate dev
    ```

5.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to see the application.

## 🏗️ Architecture

Contextra utilizes a **3-Tier Memory Hierarchy** to manage LLM context:

1.  **Core Memory (Tier 1)**: Always included in prompts. Includes the Story Bible, World Rules, and Active Characters.
2.  **Episodic Memory (Tier 2)**: Retrieved on-demand. Includes Chapter Summaries, Character Event Logs, and Scene Chunks (via RAG).
3.  **Archival (Tier 3)**: Raw storage for full chapter content and version history, never injected directly into prompts.

## 📂 Project Structure

- `src/app`: Next.js App Router pages and API endpoints.
- `src/actions`: Server Actions for encapsulated business logic.
- `src/services`: Core backend services (AI generation, RAG, Context assembly).
- `src/components`: React UI components (Workspace, Editor, Sidebars).
- `src/lib`: Core libraries (AI config, Prisma client, Authentication).
- `src/store`: Client-side state management with Zustand.
- `prisma/`: Database schema and migrations.

## 📄 License

This project is private and intended for personal/internal use.
