/**
 * /api/studio/connections — the Connections screen.
 *
 *   GET    metadata projection (never a secret)
 *   POST   create or replace a connection, sealing its secrets
 *   PATCH  toggle isActive / writeEnabled — NEVER touches secrets
 *
 * WHY POST REPLACES RATHER THAN MERGES. `upsertSapConnection` reseals the secret
 * bundle on every write, so a "just rename the label" call that omitted secrets
 * would store an EMPTY bundle and silently break a working connection — the
 * failure appearing later, at the next SAP call, far from the edit that caused
 * it. So POST demands the full credential set and says so, and metadata-only
 * changes go through PATCH, which cannot reach the secret column at all.
 *
 * SECRETS ARE WRITE-ONLY, ALWAYS. They enter here, are sealed with AES-256-GCM
 * bound to (org, product, key), and no route ever reads them back out. Nothing
 * in this file returns, logs, or audits a secret value — the audit records THAT
 * a connection changed and which fields, never what they became.
 *
 * A METADATA PROJECTION over SapConnection, and structurally incapable of
 * leaking a secret: the `select` below is an explicit allow-list that does not
 * name `secretsCiphertext`, so the column is never even read out of the database,
 * let alone serialised. Redaction here is not a filter applied on the way out
 * (which someone can forget to apply) — it is the absence of the read.
 *
 * `baseUrl` IS included: it is a non-secret hostname the consultant needs in
 * order to recognise which client system a row points at, and it is only ever
 * shown to a member of that same organization.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { normalizeEnvironment, upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { isValidSapClient } from "@/lib/sap-public/sap-url";
import { sanitizeTenantKey, SAP_ODATA_PRODUCTS } from "@/lib/sap-public/tdd-connector";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";

const PRODUCT_KEYS = SAP_ODATA_PRODUCTS.map((p) => p.key) as [string, ...string[]];

/**
 * Products whose systems address an SAP client.
 *
 * DERIVED, NOT HAND-KEPT. This was a literal set, empty while every product was
 * a cloud product. Adding private cloud, on-premise and ECC would have meant
 * editing it here AND the product list — one fact in two places, which is the
 * shape behind the two-registry defect and the five routes that knew one of
 * them. `addressesClient` on the product is now the single source.
 */
const PRODUCTS_WITH_CLIENT = new Set<string>(
  SAP_ODATA_PRODUCTS.filter((p) => p.addressesClient).map((p) => p.key),
);

/**
 * An https base URL. Rejecting http is not pedantry: these carry a client's SAP
 * credentials on every call, and a plaintext scheme would put them on the wire.
 */
const httpsUrl = z
  .string()
  .url()
  .max(500)
  .refine((u) => u.startsWith("https://"), { message: "must be https" });

const upsertSchema = z
  .object({
    product: z.enum(PRODUCT_KEYS),
    key: z.string().min(1).max(60),
    label: z.string().min(2).max(120),
    baseUrl: httpsUrl,
    authType: z.enum(["basic", "bearer", "oauth-client-credentials", "oauth-saml-bearer"]),
    environment: z.string().max(40).optional(),
    /**
     * The SAP client — "100", "080". Only meaningful for landscapes that
     * address one; see the refinement below.
     */
    client: z.string().max(3).optional(),
    username: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    bearerToken: z.string().max(2000).optional(),
    /** SuccessFactors company identifier — required by its token endpoint. */
    companyId: z.string().max(120).optional(),
    /**
     * A signed SAML assertion. Long: these are base64 XML documents, routinely
     * several kilobytes, so the usual 500-character ceiling would reject every
     * real one.
     */
    samlAssertion: z.string().max(20000).optional(),
    clientId: z.string().max(200).optional(),
    clientSecret: z.string().max(500).optional(),
    oauthTokenUrl: httpsUrl.optional(),
    writeSecret: z.string().max(500).optional(),
    writeEnabled: z.boolean().optional(),
    apiPath: z.string().max(200).optional(),
    timeoutMs: z.number().int().min(1000).max(120000).optional(),
  })
  .superRefine((v, ctx) => {
    // Each auth type needs its own fields. Accepting a "basic" connection with no
    // password would store a credential that cannot authenticate and only fails
    // at the first real SAP call.
    const need = (field: keyof typeof v, why: string) => {
      if (!v[field]) ctx.addIssue({ code: "custom", path: [field], message: why });
    };
    if (v.authType === "basic") {
      need("username", "username is required for basic auth");
      need("password", "password is required for basic auth");
    }
    if (v.authType === "bearer") need("bearerToken", "bearerToken is required for bearer auth");
    if (v.authType === "oauth-saml-bearer") {
      // SuccessFactors. `clientId` is the SF API key; the assertion is the
      // credential, so there is no clientSecret in this flow.
      need("clientId", "clientId (the SuccessFactors API key) is required for SAML bearer auth");
      need("companyId", "companyId is required for SAML bearer auth");
      need("samlAssertion", "samlAssertion is required for SAML bearer auth");
      need("oauthTokenUrl", "oauthTokenUrl is required for SAML bearer auth");
    }
    if (v.authType === "oauth-client-credentials") {
      need("clientId", "clientId is required for OAuth");
      need("clientSecret", "clientSecret is required for OAuth");
      need("oauthTokenUrl", "oauthTokenUrl is required for OAuth");
    }
    /*
     * A CLIENT ON A PRODUCT THAT HAS NONE IS A LIE THE URL WOULD TELL.
     *
     * S/4HANA Cloud Public, SuccessFactors and Ariba are one tenant per host.
     * Accepting `client: "100"` on one of them would append `?sap-client=100`
     * to every call to a system that has no such concept — at best ignored, at
     * worst a 400 on a connection that worked a moment ago.
     *
     * Refused at the boundary rather than dropped silently, because a value the
     * caller supplied and the system discarded is the kind of difference nobody
     * finds until they are debugging something else.
     */
    if (v.client !== undefined) {
      if (!PRODUCTS_WITH_CLIENT.has(v.product)) {
        ctx.addIssue({
          code: "custom",
          path: ["client"],
          message: `${v.product} is one tenant per host and has no SAP client`,
        });
      } else if (!isValidSapClient(v.client)) {
        ctx.addIssue({
          code: "custom",
          path: ["client"],
          message: "client must be three digits, e.g. 100",
        });
      }
    }

    // writeEnabled without a write secret is a switch wired to nothing.
    if (v.writeEnabled && !v.writeSecret) {
      ctx.addIssue({
        code: "custom",
        path: ["writeSecret"],
        message: "writeSecret is required when writes are enabled",
      });
    }
  });

const patchSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  writeEnabled: z.boolean().optional(),
});

type Actor = { userId: string; organizationId: string };

async function requireBuilder(): Promise<{ error: ReturnType<typeof studioError> } | Actor> {
  const user = await getCurrentUser();
  if (!user) return { error: studioError("UNAUTHENTICATED", "Sign in required.") };
  if (!canAccessStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Developer Studio is role-gated.") };
  }
  if (!canMutateStudio(user.role)) {
    return { error: studioError("FORBIDDEN", "Your role can view connections but not change them.") };
  }
  if (lacksStudioTenantScope(user) || !user.organizationId) {
    return { error: studioError("FORBIDDEN", "No organization scope.") };
  }
  return { userId: user.id, organizationId: user.organizationId };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (lacksStudioTenantScope(user)) {
    return studioError("FORBIDDEN", "No organization scope.");
  }

  const organizationId = user.organizationId;
  if (!organizationId) return studioOk({ connections: [] });

  const connections = await prisma.sapConnection.findMany({
    where: { organizationId },
    // Explicit allow-list. `secretsCiphertext` is deliberately absent — adding it
    // here is the only way this endpoint could ever expose a secret, and a test
    // asserts it stays absent.
    select: {
      id: true,
      product: true,
      key: true,
      label: true,
      baseUrl: true,
      authType: true,
      // THE LEFT-HAND OPERAND OF THE CRITICAL binding-mismatch RULE. It was
      // stored, and read by the tenant switcher's own query, and absent from
      // this projection and from the Connections table — so an operator asked to
      // explain a binding-mismatch incident could not see, anywhere on the screen
      // that manages connections, the value the rule fired on.
      environment: true,
      writeEnabled: true,
      isActive: true,
      apiPath: true,
      timeoutMs: true,
      lastValidatedAt: true,
      lastValidationStatus: true,
      createdAt: true,
    },
    orderBy: [{ product: "asc" }, { key: "asc" }],
  });

  return studioOk({ connections });
}

/**
 * POST — create or replace a connection.
 *
 * Replace, not merge: see the file header. The caller supplies the full
 * credential set every time, because the alternative is a partial write that
 * quietly empties the sealed bundle.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { userId, organizationId } = auth;

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Field-level messages, because "invalid payload" on a nine-field form with
    // conditional requirements is a guessing game.
    const first = parsed.error.issues[0];
    return studioError(
      "VALIDATION_ERROR",
      first ? `${first.path.join(".") || "payload"}: ${first.message}` : "Invalid connection payload.",
    );
  }
  const input = parsed.data;

  // Normalized the same way env tenant keys are — the key is what stored probes
  // are recorded under, so two spellings of one tenant must not split its history.
  const key = sanitizeTenantKey(input.key);
  if (!key) return studioError("VALIDATION_ERROR", "key: has no usable value once normalized.");

  const existing = await prisma.sapConnection.findFirst({
    where: { organizationId, product: input.product, key },
    select: { id: true },
  });

  /*
   * REFUSE A TWIN THE BINDING COULD NOT TELL APART.
   *
   * The database backstops this with a partial unique index (see the
   * 20260731010000 migration), but a raw 23505 reaches the consultant as an
   * opaque 500. Checking here turns it into a sentence naming the other
   * connection, while they are still looking at the form.
   *
   * The comparison normalizes through the SAME function the write path uses,
   * because the stored side is whatever that function produced — comparing
   * a raw "dev" against a stored "DEV" would wave the twin straight through.
   *
   * Only ACTIVE rows with a DECLARED environment collide, matching both the
   * index and resolveSapConnectionForEnvironment's own filters. Re-saving the
   * same KEY is replacement, not duplication, so it is excluded: that is the
   * documented way to rotate a connection's credentials.
   */
  const environment = normalizeEnvironment(input.environment);
  if (environment) {
    const twin = await prisma.sapConnection.findFirst({
      where: {
        organizationId,
        product: input.product,
        isActive: true,
        environment,
        client: input.client ?? null,
        NOT: { key },
      },
      select: { key: true, label: true },
    });
    if (twin) {
      const where = input.client ? `${environment} client ${input.client}` : environment;
      return studioError(
        "VALIDATION_ERROR",
        `"${twin.label}" (${twin.key}) is already the active ${where} connection for this product. ` +
          `Two connections the binding cannot tell apart would make every ${environment} request ambiguous, ` +
          `so neither would be served. Deactivate that one first, or give this one a different environment` +
          `${PRODUCTS_WITH_CLIENT.has(input.product) ? " or SAP client" : ""}.`,
      );
    }
  }

  /*
   * SEALING CAN THROW, AND AN UNCAUGHT THROW HERE IS INVISIBLE.
   *
   * `getEncryptionKey()` raises when SAP_CONNECTION_ENCRYPTION_KEY is unset or
   * is not 64 hex characters. Nothing caught it, so Next returned a bare 500
   * with a ZERO-BYTE body: no code, no message, no correlationId. The client
   * then called `response.json()` on nothing, and the consultant's screen
   * showed the resulting DOMException verbatim —
   *
   *     Failed to execute 'json' on 'Response': Unexpected end of JSON input
   *
   * Two layers compounding: the server could not say what broke, and the client
   * could not say the server broke. Declaring a connection is the first thing
   * this product claims to do, and on a deployment missing that key it has
   * never once succeeded — which is also why `/api/studio/connections` returns
   * an empty list, why the northbound path refuses with
   * CONNECTION_NOT_CONFIGURED, and why three of the six incident rules,
   * including the only `critical` one, cannot fire at all. One unset variable,
   * silent at every layer.
   *
   * The refusal is now diagnosable. It stays deliberately vague to the caller
   * about WHICH secret is missing — that is deployment configuration, not
   * something a consultant should learn from an API — while the server log
   * carries the real reason and the correlationId ties the two together.
   */
  let saved: Awaited<ReturnType<typeof upsertSapConnection>>;
  try {
    saved = await upsertSapConnection({
      organizationId,
      product: input.product,
      key,
      label: input.label,
      baseUrl: input.baseUrl,
      authType: input.authType,
      secrets: {
        ...(input.username ? { username: input.username } : {}),
        ...(input.password ? { password: input.password } : {}),
        ...(input.bearerToken ? { bearerToken: input.bearerToken } : {}),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.samlAssertion ? { samlAssertion: input.samlAssertion } : {}),
        ...(input.writeSecret ? { writeSecret: input.writeSecret } : {}),
      },
      oauthTokenUrl: input.oauthTokenUrl ?? null,
      environment: input.environment ?? null,
      client: input.client ?? null,
      writeEnabled: input.writeEnabled ?? false,
      apiPath: input.apiPath ?? null,
      timeoutMs: input.timeoutMs ?? null,
    });
  } catch (error) {
    console.error("[studio/connections] seal or persist failed:", error);
    return studioError(
      "INTERNAL",
      "The connection could not be sealed and was not saved. This is a deployment " +
        "configuration problem, not a problem with what you entered — quote the " +
        "correlation ID to whoever operates this environment.",
    );
  }

  // Records THAT the credential set was written, never what it is. The whole
  // point of sealing secrets is undone by an audit trail that quotes them.
  await writeConfigAudit({
    organizationId,
    actorId: userId,
    entityType: "Connection",
    entityId: saved.id,
    action: existing ? "UPDATE" : "CREATE",
    after: {
      event: existing ? "connection_replaced" : "connection_created",
      product: input.product,
      key,
      authType: input.authType,
      environment: input.environment ?? null,
      writeEnabled: input.writeEnabled ?? false,
      secretsRotated: true,
    },
  });

  return studioOk({ connection: saved, replaced: Boolean(existing) });
}

/**
 * PATCH — toggle isActive / writeEnabled.
 *
 * Deliberately cannot reach `secretsCiphertext`: this is the path for the edits
 * that should NOT require re-entering a client's password, so it is built so
 * that it could not touch one even by mistake.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireBuilder();
  if ("error" in auth) return auth.error;
  const { userId, organizationId } = auth;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid request.");
  const { id, isActive, writeEnabled } = parsed.data;

  if (isActive === undefined && writeEnabled === undefined) {
    return studioError("VALIDATION_ERROR", "Nothing to change.");
  }

  // Scoped find before update: a bare update by id would let one organization
  // toggle another's connection.
  const existing = await prisma.sapConnection.findFirst({
    where: { id, organizationId },
    select: { id: true, writeEnabled: true, isActive: true },
  });
  if (!existing) return studioError("NOT_FOUND", "Connection not found.");

  // Enabling writes needs a write secret, which lives sealed and unreadable from
  // here. Flipping the switch on a connection that never had one would produce a
  // connection that claims to allow writes and fails at the first attempt, so the
  // caller is sent to POST — where the secret can actually be supplied.
  if (writeEnabled === true && !existing.writeEnabled) {
    return studioError(
      "VALIDATION_ERROR",
      "Enabling writes requires the write secret. Re-save the connection with it instead.",
    );
  }

  const updated = await prisma.sapConnection.update({
    where: { id: existing.id, organizationId },
    data: {
      ...(isActive === undefined ? {} : { isActive }),
      ...(writeEnabled === undefined ? {} : { writeEnabled }),
    },
    select: { id: true, isActive: true, writeEnabled: true },
  });

  await writeConfigAudit({
    organizationId,
    actorId: userId,
    entityType: "Connection",
    entityId: updated.id,
    action: "UPDATE",
    after: {
      event: "connection_toggled",
      isActive: updated.isActive,
      writeEnabled: updated.writeEnabled,
    },
  });

  return studioOk({ connection: updated });
}
