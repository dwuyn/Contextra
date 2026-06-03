import { Redis } from "ioredis";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  keyFn?: (req: Request) => string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

let redis: Redis | null = null;
const _redisUrl = process.env.REDIS_URL;

if (_redisUrl) {
  redis = new Redis(_redisUrl);
  redis.on("error", (err) => {
    console.warn("[rateLimit] Redis error, falling back to memory:", err.message);
    redis = null;
  });
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function defaultKeyFn(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "127.0.0.1";
}

function now(): number {
  return Date.now();
}

async function redisCheck(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult> {
  if (!redis) {
    return memoryCheck(key, windowMs, maxRequests);
  }

  const current = now();
  const windowKey = `ratelimit:${key}`;

  try {
    const results = await redis
      .multi()
      .zremrangebyscore(windowKey, 0, current - windowMs)
      .zcard(windowKey)
      .zadd(windowKey, current, `${current}_${Math.random()}`)
      .expire(windowKey, Math.ceil(windowMs / 1000))
      .exec();

    if (!results) throw new Error("Redis multi returned null");

    const currentCount = (results[1]?.[1] ?? 0) as number;
    const remaining = Math.max(0, maxRequests - currentCount);

    return {
      allowed: currentCount < maxRequests,
      remaining,
      reset: current + windowMs,
    };
  } catch {
    return memoryCheck(key, windowMs, maxRequests);
  }
}

function memoryCheck(key: string, windowMs: number, maxRequests: number): RateLimitResult {
  const current = now();
  let entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= current) {
    entry = { count: 0, resetAt: current + windowMs };
    memoryStore.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    reset: entry.resetAt,
  };
}

setInterval(() => {
  const cutoff = now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= cutoff) {
      memoryStore.delete(key);
    }
  }
}, 60_000);

export function createRateLimiter(opts: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = "", keyFn = defaultKeyFn } = opts;

  return async (req: Request): Promise<RateLimitResult> => {
    const key = `${keyPrefix}${keyFn(req)}`;
    return redisCheck(key, windowMs, maxRequests);
  };
}

const sseConnections = new Map<string, number>();

export function sseConnectionCheck(userId: string, maxConnections: number): boolean {
  const current = sseConnections.get(userId) ?? 0;
  if (current >= maxConnections) return false;
  sseConnections.set(userId, current + 1);
  return true;
}

export function sseConnectionRelease(userId: string): void {
  const current = sseConnections.get(userId);
  if (current === undefined) return;
  if (current <= 1) {
    sseConnections.delete(userId);
  } else {
    sseConnections.set(userId, current - 1);
  }
}
