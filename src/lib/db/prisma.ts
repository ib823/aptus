import { PrismaClient } from "@prisma/client";

import { tenantScopeGuard } from "@/lib/db/tenant-guard";

/**
 * Singleton Prisma client with global caching for Next.js hot-reload.
 *
 * THE TENANT-SCOPE GUARD IS ATTACHED HERE, so it is not optional equipment: a
 * query against a tenant-anchored model that carries no organizationId — and
 * runs outside a declared cross-tenant context — throws in development and
 * test, and logs in production until the burn-in flips TENANT_SCOPE_GUARD to
 * "throw". See lib/db/tenant-guard for the modes and the two sanctioned
 * exemptions. The factory existed for months with zero attachments — a
 * declared control the runtime did not enforce.
 *
 * The cast back to PrismaClient is deliberate: `$extends` refines the type,
 * but this guard adds no methods and narrows none, and keeping the exported
 * type stable avoids threading an extension type through every consumer.
 *
 * Connection pool sizing: Prisma defaults to `num_cpus * 2 + 1` connections.
 * For Vercel serverless, set `?connection_limit=5&pool_timeout=10` on
 * DATABASE_URL to avoid exhausting the database connection limit across
 * concurrent function invocations. See .env.example for guidance.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // SERVER ONLY. Client bundles reach this module through long-standing
  // value-import chains (e.g. ProductMapTable → product-map → prisma), where
  // @prisma/client resolves to a browser stub whose constructor tolerates
  // being bundled but which has no $extends — calling it crashed every page
  // whose client chunk pulled this module in. No query can run in a browser
  // bundle, so there is nothing for the guard to guard there.
  if (typeof window !== "undefined") return base;
  return base.$extends(tenantScopeGuard()) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
