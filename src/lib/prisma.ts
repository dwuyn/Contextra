import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function readPoolMax() {
  const value = Number(process.env.DATABASE_POOL_MAX);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: readPoolMax(),
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

if (process.env.NODE_ENV === "production") {
  const onShutdown = () => {
    pool.end().catch((err) => console.error("[prisma] pool.end failed:", err));
  };
  process.on("SIGTERM", onShutdown);
  process.on("SIGINT", onShutdown);
}
