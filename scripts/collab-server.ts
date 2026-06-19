import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import type { ServerResponse } from "node:http";
import { verifyCollaborationToken } from "@/lib/collaboration/auth";
import { DEFAULT_COLLAB_PORT, getCollaborationInternalSecret as readCollaborationInternalSecret } from "@/lib/collaboration/config";
import {
  createChapterYDocFromHtml,
  encodeChapterState,
  getChapterDocumentName,
  getChapterHtmlFromYDoc,
  replaceChapterDocumentContent,
  shouldUseStoredChapterState,
} from "@/lib/collaboration/document";
import * as projectService from "@/services/projectService";

type CollaborationContext = {
  chapterId: string;
  projectId: string;
  userId: string;
  name: string;
  readOnly: boolean;
  internal?: boolean;
  operation?: "snapshot" | "replace" | "sync";
};

const INTERNAL_SECRET_HEADER = "x-collab-internal-secret";

function readPort() {
  const port = Number(process.env.COLLAB_PORT);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_COLLAB_PORT;
}

function readInternalSecret() {
  return readCollaborationInternalSecret();
}

function parseRedisConfig(redisUrl: string) {
  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    identifier: process.env.HOSTNAME || "contextra-collab",
    options: {
      username: url.username || undefined,
      password: url.password || undefined,
      db: Number.isFinite(db) ? db : undefined,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    },
  };
}

async function readJsonBody(request: AsyncIterable<Buffer | string>) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function sendJson(response: Pick<ServerResponse, "writeHead" | "end">, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function ensureInternalSecret(headers: Record<string, string | string[] | undefined>) {
  if (headers[INTERNAL_SECRET_HEADER] !== readInternalSecret()) {
    throw new Error("Unauthorized");
  }
}

const extensions: Array<Database | Redis> = [
  new Database({
    fetch: async ({ documentName }) => {
      const bootstrap = await projectService.getChapterCollaborationBootstrap(documentName);
      const stored = await projectService.getChapterCollaborationState(bootstrap.id);
      if (!stored) {
        return encodeChapterState(createChapterYDocFromHtml(bootstrap.content));
      }

      if (shouldUseStoredChapterState({
        chapterUpdatedAt: bootstrap.updatedAt,
        stateUpdatedAt: stored.updatedAt,
      })) {
        return stored.state;
      }

      const rebuiltState = encodeChapterState(createChapterYDocFromHtml(bootstrap.content));
      await projectService.saveChapterCollaborationState(bootstrap.projectId, bootstrap.id, rebuiltState);
      return rebuiltState;
    },
    store: async ({ documentName, state, document, context }) => {
      if (context?.internal && context.operation) {
        return;
      }

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const bootstrap = await projectService.getChapterCollaborationBootstrap(documentName);
          const html = getChapterHtmlFromYDoc(document);
          await projectService.syncCollaborativeChapterContent(
            bootstrap.projectId,
            bootstrap.id,
            html,
          );
          await projectService.saveChapterCollaborationState(bootstrap.projectId, bootstrap.id, state);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[collab] Store attempt ${attempt}/${maxRetries} failed for ${documentName}:`, lastError.message);

          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      console.error(`[collab] Store failed after ${maxRetries} attempts for ${documentName}:`, lastError?.message);
    },
  }),
];

if (process.env.REDIS_URL) {
  extensions.push(new Redis(parseRedisConfig(process.env.REDIS_URL)));
}

const server = new Server({
  name: "contextra-collab",
  address: "0.0.0.0",
  port: readPort(),
  quiet: true,
  extensions,
  async onStoreDocument({ documentName, context }) {
    console.log("[collab] onStoreDocument triggered:", { documentName, internal: context?.internal, operation: context?.operation });
  },
  async onDisconnect({ documentName, context }) {
    console.log("[collab] onDisconnect:", { documentName, userId: context?.userId });
  },
  async onAuthenticate({ token, connectionConfig }) {
    try {
      const payload = await verifyCollaborationToken(token);
      const { viewerAccess } = await projectService.getChapterCollaborationAccess(
        payload.projectId,
        payload.userId,
        payload.chapterId,
      );

      const readOnly = !viewerAccess.canEdit;
      connectionConfig.readOnly = readOnly;

      console.log("[collab] Auth success:", { userId: payload.userId, chapterId: payload.chapterId, readOnly });

      return {
        chapterId: payload.chapterId,
        projectId: payload.projectId,
        userId: payload.userId,
        name: payload.name,
        readOnly,
      } satisfies CollaborationContext;
    } catch (error) {
      console.error("[collab] Auth failed:", error instanceof Error ? error.message : error);
      throw error;
    }
  },
  async onUpgrade({ request, socket }) {
    if (!request.url?.startsWith("/collab")) {
      socket.destroy();
      throw null;
    }
  },
  async onRequest({ request, response, instance }) {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host ?? "127.0.0.1"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true });
        throw null;
      }

      if (request.method === "POST" && url.pathname === "/internal/documents/export") {
        ensureInternalSecret(request.headers);
        const body = await readJsonBody(request);
        const chapterId = typeof body.chapterId === "string" ? body.chapterId : null;
        if (!chapterId) {
          sendJson(response, 400, { error: "Missing chapterId" });
          throw null;
        }

        const bootstrap = await projectService.getChapterCollaborationBootstrap(getChapterDocumentName(chapterId));
        sendJson(response, 200, await snapshotDocument(instance, chapterId, bootstrap.projectId));
        throw null;
      }

      if (request.method === "POST" && url.pathname === "/internal/documents/replace") {
        ensureInternalSecret(request.headers);
        const body = await readJsonBody(request);
        const chapterId = typeof body.chapterId === "string" ? body.chapterId : null;
        const projectId = typeof body.projectId === "string" ? body.projectId : null;
        const html = typeof body.html === "string" ? body.html : null;

        if (!chapterId || !projectId || html == null) {
          sendJson(response, 400, { error: "Missing chapterId, projectId, or html" });
          throw null;
        }

        sendJson(response, 200, await replaceDocument(instance, chapterId, projectId, html));
        throw null;
      }

      if (request.method === "POST" && url.pathname === "/internal/documents/sync") {
        ensureInternalSecret(request.headers);
        const body = await readJsonBody(request);
        const chapterId = typeof body.chapterId === "string" ? body.chapterId : null;
        const projectId = typeof body.projectId === "string" ? body.projectId : null;
        const html = typeof body.html === "string" ? body.html : null;

        if (!chapterId || !projectId || html == null) {
          sendJson(response, 400, { error: "Missing chapterId, projectId, or html" });
          throw null;
        }

        sendJson(response, 200, await syncDocument(instance, chapterId, projectId, html));
        throw null;
      }
    } catch (error) {
      if (error == null) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Internal Server Error";
      const status = message === "Unauthorized" ? 401 : message === "Chapter not found" ? 404 : 500;
      sendJson(response, status, { error: message });
      throw null;
    }
  },
});

async function snapshotDocument(instance: Server["hocuspocus"], chapterId: string, projectId: string) {
  const directConnection = await instance.openDirectConnection(getChapterDocumentName(chapterId), {
    chapterId,
    projectId,
    userId: "internal",
    name: "internal",
    readOnly: false,
    internal: true,
    operation: "snapshot",
  } satisfies CollaborationContext);

  let html = "<p></p>";
  let state = new Uint8Array();

  await directConnection.transact((document) => {
    html = getChapterHtmlFromYDoc(document);
    state = encodeChapterState(document);
  });

  directConnection.disconnect();

  await projectService.saveChapterCollaborationState(projectId, chapterId, state);
  const syncResult = await projectService.syncCollaborativeChapterContent(projectId, chapterId, html);

  return {
    html,
    continuity: syncResult.continuity,
  };
}

async function replaceDocument(instance: Server["hocuspocus"], chapterId: string, projectId: string, html: string) {
  const directConnection = await instance.openDirectConnection(getChapterDocumentName(chapterId), {
    chapterId,
    projectId,
    userId: "internal",
    name: "internal",
    readOnly: false,
    internal: true,
    operation: "replace",
  } satisfies CollaborationContext);

  let nextHtml = html;
  let state = new Uint8Array();

  await directConnection.transact((document) => {
    replaceChapterDocumentContent(document, html);
    nextHtml = getChapterHtmlFromYDoc(document);
    state = encodeChapterState(document);
  });

  directConnection.disconnect();

  const syncResult = await projectService.syncCollaborativeChapterContent(projectId, chapterId, nextHtml);
  await projectService.saveChapterCollaborationState(projectId, chapterId, state);

  return {
    html: nextHtml,
    continuity: syncResult.continuity,
  };
}

async function syncDocument(instance: Server["hocuspocus"], chapterId: string, projectId: string, html: string) {
  const directConnection = await instance.openDirectConnection(getChapterDocumentName(chapterId), {
    chapterId,
    projectId,
    userId: "internal",
    name: "internal",
    readOnly: false,
    internal: true,
    operation: "sync",
  } satisfies CollaborationContext);

  let nextHtml = html;
  let state = new Uint8Array();

  await directConnection.transact((document) => {
    replaceChapterDocumentContent(document, html);
    nextHtml = getChapterHtmlFromYDoc(document);
    state = encodeChapterState(document);
  });

  directConnection.disconnect();

  await projectService.saveChapterCollaborationState(projectId, chapterId, state);

  return {
    html: nextHtml,
  };
}

async function main() {
  const secretSource = process.env.COLLAB_JWT_SECRET
    ? "COLLAB_JWT_SECRET"
    : process.env.JWT_SECRET
      ? "JWT_SECRET"
      : "fallback";
  console.log("[collab] Starting server on port", readPort(), "| JWT secret source:", secretSource);
  await server.listen(readPort());
}

main().catch((error) => {
  console.error("Collaboration server crashed:", error);
  process.exit(1);
});
