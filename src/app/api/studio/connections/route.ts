/**
 * /api/studio/connections — the Connections screen.
 *
 *   GET    metadata projection (never a secret)
 *   POST   create or replace a connection, sealing its secrets
 *   PATCH  toggle isActive / writeEnabled — NEVER touches secrets
 *
 * Saving secrets (POST) and anything that turns writes on (PATCH) need a fresh
 * passkey once COREEDGE_STEP_UP is enforce (lib/auth/step-up.ts).
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

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { requireStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import { recordJourneyEvent } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import {
  isAllowedApiKeyHeader,
  normalizeEnvironment,
  upsertSapConnection,
} from "@/lib/sap-public/connection-resolver";
import {
  ENVIRONMENT_VALUES,
  isUnrecognisedEnvironment,
  type SapEnvironment,
} from "@/lib/sap-public/environment";
import { parseSamlPrivateKey, SamlKeyError, XML_ILLEGAL_CHARACTER } from "@/lib/sap-public/saml-assertion";
import { isValidSapClient } from "@/lib/sap-public/sap-url";
import { newSuccessFactorsBasicConnectionNotice } from "@/lib/sap-public/sf-basic-auth-sunset";
import {
  getConfiguredSapTenants,
  getSapProduct,
  sanitizeTenantKey,
  SAP_ODATA_PRODUCTS,
} from "@/lib/sap-public/tdd-connector";
import { studioError, studioOk } from "@/lib/studio/api";
import { checkSapHost } from "@/lib/studio/sap-host-allowlist";
import { isForbiddenBaseUrlHost } from "@/lib/studio/connection-url-guard";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import type { SessionUser } from "@/types/assessment";

export const dynamic = "force-dynamic";

/*
 * EVERY CONNECTABLE PRODUCT — the OData registry PLUS Ariba. The picker offers
 * six tiles (Object.keys(PRODUCT_MARKS)); this list held five, so selecting
 * the Ariba tile and saving failed the enum with a validation error the form
 * could not explain. Ariba is deliberately not in SAP_ODATA_PRODUCTS (it is
 * REST, not OData, and must not be double-counted by listProductSummaries) —
 * but a connection to it is real, which is why getSapProduct("ariba") answers.
 * The reconciliation test now asserts BOTH directions: every mark is
 * accepted here, and everything accepted here has a mark.
 */
const PRODUCT_KEYS = ["ariba", ...SAP_ODATA_PRODUCTS.map((p) => p.key)] as [string, ...string[]];

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
  .refine((u) => u.startsWith("https://"), { message: "must be https" })
  // A user name or password in the URL would travel with every request, and
  // fetch refuses such a URL with an error that repeats it.
  .refine(
    (u) => {
      try {
        const url = new URL(u);
        return !url.username && !url.password;
      } catch {
        return true;
      }
    },
    { message: "must not contain a user name or password" },
  )
  .refine((u) => !isForbiddenBaseUrlHost(u), {
    message:
      "must be a public hostname — IP literals, localhost and internal names are refused (the broker calls this URL with credentials attached)",
  })
  /*
   * THE ALLOW-LIST, and its position in this chain is the security property.
   *
   * Zod refinements run during PARSE, which happens before the handler touches
   * the database — so a host that is not SAP's is refused BEFORE any credential
   * is stored. Validating after storage means the mistake has already happened:
   * the secret is on an unknown host's row and revoking it becomes a cleanup
   * job rather than a refusal.
   *
   * The deny-list above stays and still runs first. The two are not
   * alternatives: a deny-list answers "is this one of the hosts we know is
   * bad", and only an allow-list refuses https://sap-s4-prod.attacker.example,
   * which passes every other check here.
   */
  .superRefine((u, ctx) => {
    const verdict = checkSapHost(u);
    if (!verdict.allowed) {
      ctx.addIssue({ code: "custom", message: verdict.reason });
    }
  });

const upsertSchema = z
  .object({
    product: z.enum(PRODUCT_KEYS),
    key: z.string().min(1).max(60),
    label: z.string().min(2).max(120),
    baseUrl: httpsUrl,
    authType: z.enum(["basic", "bearer", "oauth-client-credentials", "oauth-saml-bearer", "api-key"]),
    /**
     * The landscape this system serves — one of SANDBOX | DEV | TEST | PROD
     * (settled decision D1).
     *
     * REFUSED RATHER THAN COERCED. The column is now an enum, so an
     * unrecognised word can only be stored as NULL — "undeclared" — and a form
     * that silently downgrades "Staging" to undeclared would leave the
     * consultant looking at a connection they believe is declared while the
     * broker refuses every write against it with UNDECLARED_ENVIRONMENT_WRITE.
     * Blank still means undeclared, which is a legitimate answer; a word we do
     * not accept is a mistake and is named as one.
     */
    environment: z
      .string()
      .max(40)
      .optional()
      .refine((v) => !isUnrecognisedEnvironment(v), {
        message: `must be one of ${ENVIRONMENT_VALUES.join(", ")} — or left blank if the landscape is not yet known`,
      }),
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
    /**
     * The OAuth client registration's RSA private key, so CoreEdge signs a
     * fresh assertion per exchange instead of storing one that expires. PEM or
     * headerless base64; a 4096-bit PEM key is about 3.3 kB.
     */
    samlPrivateKey: z.string().max(10000).optional(),
    /** The SuccessFactors user a signed assertion is issued for. */
    samlUserId: z.string().trim().max(255).optional(),
    clientId: z.string().max(200).optional(),
    clientSecret: z.string().max(500).optional(),
    /** API-key header auth (AD-12): the key, and the header it travels in (default `apikey`). */
    apiKey: z.string().max(2000).optional(),
    apiKeyHeader: z
      .string()
      .max(80)
      .refine(isAllowedApiKeyHeader, {
        message:
          "apiKeyHeader must be a plain header name (letters, digits, hyphens) and cannot be one the transport sets itself — Authorization, Cookie and Host among them.",
      })
      .optional(),
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
      //
      // Whitespace is missing here, as it is to the exchange: a company id of
      // "   " saved cleanly and then failed every token request.
      const needText = (field: "clientId" | "companyId" | "oauthTokenUrl" | "samlAssertion", why: string) => {
        if (!v[field]?.trim()) ctx.addIssue({ code: "custom", path: [field], message: why });
      };
      needText("clientId", "clientId (the SuccessFactors API key) is required for SAML bearer auth");
      needText("companyId", "companyId is required for SAML bearer auth");
      needText("oauthTokenUrl", "oauthTokenUrl is required for SAML bearer auth");
      // A URL never holds these, and fetch deletes them: the signed Recipient
      // would differ from the URL posted to.
      if (v.oauthTokenUrl && /[\t\r\n]/.test(v.oauthTokenUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["oauthTokenUrl"],
          message: "oauthTokenUrl contains a tab or line break. Type it again rather than pasting it.",
        });
      }
      /*
       * WHAT THE ASSERTION CARRIES MUST BE XML. A control character in any of
       * these makes every assertion a document no parser accepts, and the
       * refusal would come back looking like a key or user problem. Refused
       * here, where it was typed.
       */
      for (const field of ["clientId", "samlUserId", "oauthTokenUrl"] as const) {
        if (v[field] && XML_ILLEGAL_CHARACTER.test(v[field])) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `${field} contains a control character, which a SAML assertion cannot carry. Type it again rather than pasting it.`,
          });
        }
      }
      /*
       * EITHER COREEDGE SIGNS, OR AN ASSERTION IS PASTED. The key is the
       * durable choice — a pasted assertion expires, by SAP's default within
       * ten minutes — so it is the one this asks for first.
       */
      if (v.samlPrivateKey) {
        need("samlUserId", "samlUserId (the SuccessFactors user the assertion is issued for) is required with a signing key");
        /*
         * PROVEN USABLE BEFORE IT IS SEALED. A key that cannot sign would be
         * stored, and then fail every token exchange as an opaque 401. The
         * refusal is SamlKeyError's own sentence, which never echoes the key.
         */
        try {
          parseSamlPrivateKey(v.samlPrivateKey);
        } catch (error) {
          ctx.addIssue({
            code: "custom",
            path: ["samlPrivateKey"],
            message: error instanceof SamlKeyError ? error.message : "The signing key could not be read.",
          });
        }
      } else {
        needText(
          "samlAssertion",
          "a signing key (samlPrivateKey + samlUserId) or a pre-signed samlAssertion is required for SAML bearer auth",
        );
      }
    }
    if (v.authType === "oauth-client-credentials") {
      need("clientId", "clientId is required for OAuth");
      need("clientSecret", "clientSecret is required for OAuth");
      need("oauthTokenUrl", "oauthTokenUrl is required for OAuth");
    }
    if (v.authType === "api-key") need("apiKey", "apiKey is required for API-key header auth");
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

/** `user` is the whole session user: the step-up gate reads its passkey state. */
type Actor = { userId: string; organizationId: string; user: SessionUser };

/**
 * The keys of the tenants this deployment configures for a product in env.
 *
 * `getConfiguredSapTenants` throws on a malformed `{PREFIX}_TENANTS_JSON`. A
 * product whose env cannot be read has no deployment tenants this check can
 * see, and the read path refuses a collision anyway once the env is fixed, so
 * one bad variable must not stop every connection from being saved.
 */
function deploymentTenantKeys(productKey: string): string[] {
  const product = getSapProduct(productKey);
  if (!product) return [];
  try {
    return getConfiguredSapTenants(product.envPrefix).map((t) => t.key);
  } catch {
    return [];
  }
}

/**
 * The ACTIVE connection the binding could not tell apart from this one: same
 * product, same declared environment, same SAP client. Shared by POST (a new
 * or replaced row) and PATCH (reactivating a row), so the two doors refuse
 * the same twin in the same words — the database's partial unique index
 * (migration 20260731010000) backs both, but surfaces as an opaque 500.
 */
async function findActiveTwin(target: {
  organizationId: string;
  product: string;
  environment: SapEnvironment;
  client: string | null;
  /** The row itself: by key on a save (a re-save replaces it), by id on a toggle. */
  excluding: { key: string } | { id: string };
}): Promise<{ key: string; label: string } | null> {
  return prisma.sapConnection.findFirst({
    where: {
      organizationId: target.organizationId,
      product: target.product,
      isActive: true,
      environment: target.environment,
      client: target.client,
      NOT: target.excluding,
    },
    select: { key: true, label: true },
  });
}

function twinRefusal(
  twin: { key: string; label: string },
  target: { product: string; environment: string; client: string | null },
  subject: string,
): string {
  const where = target.client ? `${target.environment} client ${target.client}` : target.environment;
  return (
    `"${twin.label}" (${twin.key}) is already the active ${where} connection for this product. ` +
    `Two connections the binding cannot tell apart would make every ${target.environment} request ambiguous, ` +
    `so neither would be served. Deactivate that one first, or give ${subject} a different environment` +
    `${PRODUCTS_WITH_CLIENT.has(target.product) ? " or SAP client" : ""}.`
  );
}

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
  return { userId: user.id, organizationId: user.organizationId, user };
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
  const { userId, organizationId, user } = auth;

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
   * REFUSE A KEY THE DEPLOYMENT ALREADY USES FOR ITS OWN TENANT.
   *
   * The console resolves a tenant key against the deployment's `{PREFIX}_*`
   * tenants as well as this organization's connections (tenant-for-read). A
   * connection keyed "default" on a deployment configured with S4_TDD_BASE_URL
   * was listed in the switcher as the organization's own system, while every
   * read went to the shared demo tenant with the deployment's credentials and
   * skipped the PROD ceiling. The read path now refuses such a key rather than
   * guess; refusing it here means the consultant learns it while still on the
   * form, instead of at the first read.
   *
   * New keys only. Re-saving an existing row is how its credentials are
   * rotated, and that row may be serving northbound calls, which never look at
   * deployment tenants. Blocking the rotation would break those calls to fix a
   * console read that is already refused.
   */
  if (!existing && deploymentTenantKeys(input.product).includes(key)) {
    return studioError(
      "VALIDATION_ERROR",
      `key: "${key}" is already the key of a tenant configured on this deployment, so the console ` +
        `could not tell your connection from it. Choose another key.`,
    );
  }

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
    const twin = await findActiveTwin({
      organizationId,
      product: input.product,
      environment,
      client: input.client ?? null,
      excluding: { key },
    });
    if (twin) {
      return studioError(
        "VALIDATION_ERROR",
        twinRefusal(twin, { product: input.product, environment, client: input.client ?? null }, "this one"),
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
  /*
   * A FRESH PASSKEY before a client's SAP credentials are sealed — and before
   * writes are switched on, which only this path can do (lib/auth/step-up.ts).
   * Asked after every validation above, so a form with a mistake in it is
   * refused for the mistake, not for the passkey.
   */
  const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
    action: "connection.save_secrets",
    targetId: existing?.id ?? null,
  });
  if (!stepUp.ok) return stepUp.response;

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
        ...(input.samlPrivateKey ? { samlPrivateKey: input.samlPrivateKey } : {}),
        ...(input.samlUserId ? { samlUserId: input.samlUserId } : {}),
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        ...(input.apiKeyHeader ? { apiKeyHeader: input.apiKeyHeader } : {}),
        ...(input.writeSecret ? { writeSecret: input.writeSecret } : {}),
      },
      oauthTokenUrl: input.oauthTokenUrl ?? null,
      environment,
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

  /*
   * A NEW SUCCESSFACTORS CONNECTION ON BASIC IS SAVED, AND TOLD WHEN IT ENDS.
   *
   * SAP makes Basic unavailable for new SuccessFactors configurations on
   * 2026-11-20 and deletes it later (tentatively 2027-11-12). The save is NOT
   * refused: Basic still authenticates until deletion, and refusing would get
   * ahead of SAP's own schedule. New rows only — re-saving an existing one is
   * credential rotation, and blocking or nagging it would punish the connection
   * that is already running. The form shows the same sentence before Save; this
   * copy is for every other caller of the API, and for the audit trail.
   */
  const warning = existing ? null : newSuccessFactorsBasicConnectionNotice(input.product, input.authType);

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
      environment,
      writeEnabled: input.writeEnabled ?? false,
      secretsRotated: true,
      ...(warning ? { sfBasicAuthSunsetWarned: true } : {}),
    },
  });

  /*
   * SAP-ADMIN SET-UP WAIT STARTS WHEN A CONNECTION IS FIRST SAVED (P2.12),
   * and ends at its first successful probe. A re-save is credential rotation,
   * not set-up, so only a new connection is a milestone.
   */
  if (!existing) {
    await recordJourneyEvent({
      organizationId,
      kind: "CONNECTION_SAVED",
      subjectId: saved.id,
      environment,
      actorUserId: userId,
    });
  }

  return studioOk({ connection: saved, replaced: Boolean(existing), ...(warning ? { warning } : {}) });
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
  const { userId, organizationId, user } = auth;

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
    select: {
      id: true,
      writeEnabled: true,
      isActive: true,
      product: true,
      environment: true,
      client: true,
    },
  });
  if (!existing) return studioError("NOT_FOUND", "Connection not found.");

  /*
   * ACTIVATING A TWIN IS A TYPED 409, NOT AN EMPTY 500 (P0.1, A52). POST
   * refuses a second active connection the binding could not tell apart; this
   * toggle — what Studio's "Activate" sends — did not, so reactivating B
   * after A had replaced it hit the partial unique index and Next answered a
   * bare 500 with no body. Same lookup and words as POST; CONFLICT, because
   * the request is well-formed and the other row's state is what stands in
   * the way.
   */
  const activating = isActive === true && !existing.isActive;
  if (activating && existing.environment) {
    const target = { product: existing.product, environment: existing.environment, client: existing.client ?? null };
    const twin = await findActiveTwin({ organizationId, ...target, excluding: { id: existing.id } });
    if (twin) return studioError("CONFLICT", twinRefusal(twin, target, "this connection"));
  }

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

  /*
   * A FRESH PASSKEY WHEN THIS TURNS WRITES ON. The check above refuses to
   * enable writes outright, but reactivating a deactivated connection that
   * still carries writeEnabled turns a write path back on all the same.
   * Turning things OFF stays one press: it is the direction an incident needs.
   */
  const writableBefore = existing.isActive && existing.writeEnabled;
  const writableAfter = (isActive ?? existing.isActive) && (writeEnabled ?? existing.writeEnabled);
  if (writableAfter && !writableBefore) {
    const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
      action: "connection.enable_writes",
      targetId: existing.id,
    });
    if (!stepUp.ok) return stepUp.response;
  }

  let updated: { id: string; isActive: boolean; writeEnabled: boolean };
  try {
    updated = await prisma.sapConnection.update({
      where: { id: existing.id, organizationId },
      data: {
        ...(isActive === undefined ? {} : { isActive }),
        ...(writeEnabled === undefined ? {} : { writeEnabled }),
      },
      select: { id: true, isActive: true, writeEnabled: true },
    });
  } catch (error) {
    // A twin activated between the check above and this write: the index
    // decides the race, and the loser gets the same typed refusal.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return studioError(
        "CONFLICT",
        "Another connection for the same product, environment and SAP client was activated a moment ago. Reload to see it; deactivate it first if this one should serve.",
      );
    }
    throw error;
  }

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
