/**
 * The cookie remembering which tenant you were last looking at.
 *
 * A MODULE OF ITS OWN, WITH NO IMPORTS, because both sides need it and each
 * side poisons the other's bundle:
 *
 *  - Exported from StudioTopBar (`"use client"`), the server readers got a
 *    client REFERENCE, and the cookie's NAME became stringified function
 *    source on a live deployment (see the history in lib/studio/tenants).
 *  - Exported from lib/studio/tenants, the client re-export dragged the whole
 *    server module — Prisma client, and with the tenant-scope guard attached,
 *    node:async_hooks — into the browser bundle, which cannot build it.
 *
 * A constant shared by client and server belongs in a module that is safe in
 * both, which means: no directive, no imports.
 */
export const STUDIO_TENANT_COOKIE = "studio-tenant";
