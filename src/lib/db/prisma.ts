import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client with global caching for Next.js hot-reload.
 *
 * Connection pool sizing: Prisma defaults to `num_cpus * 2 + 1` connections.
 * For Vercel serverless, set `?connection_limit=5&pool_timeout=10` on
 * DATABASE_URL to avoid exhausting the database connection limit across
 * concurrent function invocations. See .env.example for guidance.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
