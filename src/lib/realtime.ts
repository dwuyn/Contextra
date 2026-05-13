import { Redis } from "ioredis";

type SSEConnection = {
  userId: string;
  controller: ReadableStreamDefaultController;
};

// Global variable to persist in development
declare global {
  var __sse_connections: Map<string, Set<SSEConnection>> | undefined;
  var __redis_publisher: Redis | undefined;
  var __redis_subscriber: Redis | undefined;
  var __redis_subscriber_active: boolean | undefined;
}

const connections = (process.env.NODE_ENV === "development" && globalThis.__sse_connections) 
  ? globalThis.__sse_connections 
  : new Map<string, Set<SSEConnection>>();

if (process.env.NODE_ENV === "development") {
  globalThis.__sse_connections = connections;
}

const redisUrl = process.env.REDIS_URL;
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

// Initialize Redis Pub/Sub if configured
if (redisUrl) {
  publisher = globalThis.__redis_publisher || new Redis(redisUrl);
  subscriber = globalThis.__redis_subscriber || new Redis(redisUrl);

  if (process.env.NODE_ENV === "development") {
    globalThis.__redis_publisher = publisher;
    globalThis.__redis_subscriber = subscriber;
  }

  // Set up subscriber listening logic only once
  if (!globalThis.__redis_subscriber_active) {
    subscriber.subscribe("contextra_events", (err) => {
      if (err) console.error("Failed to subscribe to Redis contextra_events", err);
    });

    subscriber.on("message", (channel, message) => {
      if (channel === "contextra_events") {
        try {
          const { userId, event, data } = JSON.parse(message);
          const userCons = connections.get(userId);
          
          if (userCons) {
            const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            const encoder = new TextEncoder();
            userCons.forEach((conn) => {
              try {
                conn.controller.enqueue(encoder.encode(payload));
              } catch (e) {
                console.error("Failed to enqueue Redis SSE event", e);
              }
            });
          }
        } catch (err) {
          console.error("Failed to process Redis message", err);
        }
      }
    });

    if (process.env.NODE_ENV === "development") {
      (globalThis as any).__redis_subscriber_active = true;
    }
  }
}

export function addConnection(userId: string, controller: ReadableStreamDefaultController) {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  const userCons = connections.get(userId)!;
  const conn = { userId, controller };
  userCons.add(conn);

  return () => {
    userCons.delete(conn);
    if (userCons.size === 0) {
      connections.delete(userId);
    }
  };
}

export function sendEvent(userId: string, event: string, data: any) {
  if (publisher) {
    // Distributed: Publish to Redis to reach all server instances
    publisher.publish("contextra_events", JSON.stringify({ userId, event, data })).catch((err) => {
      console.error("Failed to publish to Redis", err);
    });
  } else {
    // Fallback: Local in-memory only (single instance)
    const userCons = connections.get(userId);
    if (userCons) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      const encoder = new TextEncoder();
      userCons.forEach((conn) => {
        try {
          conn.controller.enqueue(encoder.encode(payload));
        } catch (e) {
          console.error("Failed to send SSE event", e);
        }
      });
    }
  }
}

