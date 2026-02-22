import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Use Neon serverless HTTP driver on Vercel for faster cold starts
  // HTTP connections avoid TCP/TLS handshake overhead, critical for
  // cross-region (iad1 → Singapore) serverless function invocations
  if (process.env.VERCEL && process.env.DATABASE_URL) {
    const adapter = new PrismaNeonHttp(process.env.DATABASE_URL, { arrayMode: false, fullResults: true });
    return new PrismaClient({
      adapter,
      log: ["error"],
    });
  }

  // Standard TCP connection for local development
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
