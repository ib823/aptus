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
 * WRITES ARE SWITCHED ON HERE, FROM THE FORM (P0.3). A save is the only door
 * that turns `writeEnabled` on — and the Connections form never offered it,
 * so no screen could enable writes, and every re-save (how credentials are
 * rotated) silently switched a writing connection's writes off. The form now
 * carries "Allow writes", ticked by default when re-saving a connection that
 * allows writes.
 *
 * THERE IS NO CONNECTION WRITE SECRET (wave 2 integration review round 3).
 * A save that turned writes on had to carry a `writeSecret`, sealed with the
 * bundle, and nothing ever read it back: not the broker's write route (it
 * checks the app's own write key), not the SAP request, not the Workbench
 * write-back (it checks the deployment's env secret). Any string switched
 * writes on, so the requirement, the form field and PATCH's "requires the
 * write secret" refusal told operators a second factor guarded writes when
 * none did. What guards a write is this switch, the passkey and audit row of
 * the save that turns it on, the approved write grant and the app's write
 * key. A `writeSecret` an older caller still sends is accepted and ignored:
 * it is not sealed, and it changes nothing.
 * A save that turns writes on is the governance action
 * `connection.enable_writes`; one that turns them off (writeEnabled omitted or
 * false over a writing row) says so in its response and its audit row, and is
 * not refused: turning writes off is the safe direction.
 *
 * Writes are allowed for a SYSTEM — environment, SAP host and base path, SAP client — not
 * for a row id, so a save that keeps them on while pointing the row at
 * another system is `connection.enable_writes` too, and its audit row says
 * what the row pointed at before. A save from a form whose view of the row is
 * stale (it sends what it showed, `expected`) is refused with 409, and a save
 * that reactivates a deactivated row says so (P0.3 review round 2).
 *
 * The judgement and the write are one step (P0.3 review round 3): the upsert
 * writes only while the row is still the one the save was judged on, so a
 * Deactivate landing while the passkey is asked is never overwritten
 * unannounced — the save is judged again on the row as it now is. PATCH is
 * held to the same rule (review round 4): its update writes only while the
 * row still holds the state its gates were judged on, so a builder's stale
 * "Activate" cannot undo a Deactivate, or a writes-off, past the passkey and
 * the write-secret refusal. Either door records a warn-mode passkey
 * admission once per request, for the judgement it acted on.
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
import {
  checkStepUp,
  recordStepUpMissing,
  STEP_UP_MAX_AGE_SECONDS,
  type StepUpMissing,
} from "@/lib/auth/step-up";
import { recordJourneyEvent } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import { settleConnectionGroup } from "@/lib/ops/connection-probe-sweep";
import {
  isAllowedApiKeyHeader,
  normalizeEnvironment,
  SapConnectionChangedError,
  storedApiKeyHeader,
  upsertSapConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import {
  rotationProbeMode,
  rotationProbeWarning,
  rotationRefusal,
  type RotationProbeRecord,
} from "@/lib/sap-public/rotation";
import { probeForSave, type RotationProbeResult } from "@/lib/sap-public/rotation-probe";
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
import { writeTargetChanges, type WriteTargetField } from "@/lib/studio/connection-form";
import { checkSapHost } from "@/lib/studio/sap-host-allowlist";
import { isForbiddenBaseUrlHost } from "@/lib/studio/connection-url-guard";
import { writeConfigAudit } from "@/lib/studio/audit";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import type { SessionUser } from "@/types/assessment";

export const dynamic = "force-dynamic";
/*
 * A SAVE MAY WAIT ON SAP (wave 2 integration review round 2). Re-saving a
 * working connection with new credentials probes them first (P0.14,
 * rotation-probe.ts): a token exchange and the $metadata, in series. The
 * probe stops at ROTATION_PROBE_DEADLINE_MS (40 s), the token exchange at
 * TOKEN_REQUEST_TIMEOUT_MS (10 s); this leaves 40 s for step-up, the
 * judgement and the write. Without it a platform default below the probe
 * time cut the function off: a bare 504, nothing saved, no refusal audited.
 * Held to the deadline by tests/unit/sap-public/rotation-probe.test.ts.
 */
export const maxDuration = 90;

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
    /**
     * Keep the API-key header name the replaced connection stores, when this
     * save sends none (wave 2 rotation probe review round 2). The header is
     * sealed with the key, so the Connections form cannot show it; it sends
     * this while its Header name field is blank on a re-save of an API-key
     * connection, and a re-save no longer resets a custom header to
     * `apikey`. Absent (any other caller): a save without `apiKeyHeader`
     * uses the default, as before. Ignored when `apiKeyHeader` is sent.
     */
    keepStoredApiKeyHeader: z.boolean().optional(),
    oauthTokenUrl: httpsUrl.optional(),
    /** Accepted from older callers and ignored: nothing reads a connection write secret (file header). */
    writeSecret: z.string().max(500).optional(),
    writeEnabled: z.boolean().optional(),
    /**
     * What the Connections form showed for the row this save replaces, or
     * null when it showed the key as new (P0.3 review round 2). The save is
     * refused (409) when the row no longer matches: a form opened before an
     * operator deactivated a writing connection would otherwise bring it back
     * active with its writes on. Absent — an API caller — skips the check.
     */
    expected: z.object({ isActive: z.boolean(), writeEnabled: z.boolean() }).nullable().optional(),
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

  });

const patchSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  writeEnabled: z.boolean().optional(),
});

/** `user` is the whole session user: the step-up gate reads its passkey state. */
type Actor = { userId: string; organizationId: string; user: SessionUser };

/**
 * How many times a save is judged again when the row changes under it before
 * the write (review round 3). A row that changes three times within one save
 * is being fought over; the builder is told to reload rather than win.
 */
const MAX_SAVE_ATTEMPTS = 3;

/**
 * A save or toggle that ends without writing, after its latest judgement was
 * admitted in warn mode without a passkey: that admission is still recorded,
 * once (review round 4). Enforce would have refused the request, which is
 * the number the switch to enforce is judged on (step-up.ts
 * `recordStepUpMissing`: one row per admission, including one whose write
 * then loses a race).
 */
async function withStepUpRecorded(missing: StepUpMissing | null, response: Response): Promise<Response> {
  if (missing) await recordStepUpMissing(missing);
  return response;
}

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
      // With the environment and host, the system the row's writes are
      // allowed for (P0.3 review round 2).
      client: true,
      writeEnabled: true,
      isActive: true,
      apiPath: true,
      timeoutMs: true,
      // Non-secret, like the host: the form sends it back on a re-save
      // unless it is edited (wave 2 final review round 3).
      oauthTokenUrl: true,
      lastValidatedAt: true,
      lastValidationStatus: true,
      createdAt: true,
    },
    orderBy: [{ product: "asc" }, { key: "asc" }],
  });

  return studioOk({ connections });
}

/** What a save does to the row it replaces, judged on that row as it was read. */
interface SaveJudgement {
  /** The row the save replaces, as judged — the upsert writes only while it is still this. */
  existing: {
    id: string;
    isActive: boolean;
    writeEnabled: boolean;
    environment: SapEnvironment | null;
    baseUrl: string;
    client: string | null;
    revision: number;
    /** Whether the secret being replaced is working today: decides the rotation probe (P0.14). */
    lastValidationStatus: string | null;
    /** SapConnection.transport: a TWIN connection is never probed (rotation-probe.ts `rotationProbeSkip`). */
    transport: string;
    /** The stored probe path and timeout: a save that leaves either out is probed with it (rotation-probe.ts `probeTarget`). */
    apiPath: string | null;
    timeoutMs: number | null;
  } | null;
  writableAfter: boolean;
  targetChanges: WriteTargetField[];
  movesLiveWrites: boolean;
  enablesWrites: boolean;
  disablesWrites: boolean;
  reactivates: boolean;
}

/**
 * Reads the row a save replaces and judges what the save does to it — or the
 * refusal, when the form's view is stale or the key or twin cannot be saved.
 * Called again when the row changes before the write (review round 3), so
 * every answer — the step-up action, the response, the audit row — comes from
 * the row the write actually replaces.
 */
async function judgeSave(
  organizationId: string,
  key: string,
  input: z.infer<typeof upsertSchema>,
  environment: SapEnvironment | null,
  writeEnabled: boolean,
): Promise<SaveJudgement | { refusal: ReturnType<typeof studioError> }> {
  const existing = await prisma.sapConnection.findFirst({
    where: { organizationId, product: input.product, key },
    // isActive and writeEnabled: whether this save turns writes on, or off
    // (P0.3); environment, baseUrl and client: which system they were on for
    // (review round 2).
    // revision: bumped by every re-save, so the write can tell this row from a
    // newer save of it (review round 3).
    select: {
      id: true,
      isActive: true,
      writeEnabled: true,
      environment: true,
      baseUrl: true,
      client: true,
      revision: true,
      // isActive and lastValidationStatus say whether the secret being
      // replaced is working today, which decides whether the new one is
      // probed first (P0.14).
      lastValidationStatus: true,
      // A connection served by the Tenant Twin is never probed (rotation-probe.ts).
      transport: true,
      // Where, and how patiently, its $metadata is probed when the save
      // leaves these out (wave 2 final review round 3).
      apiPath: true,
      timeoutMs: true,
    },
  });

  /*
   * A FORM OPENED BEFORE THE ROW CHANGED IS REFUSED (P0.3 review round 2).
   * The form's "Allow writes" default, and everything its notices say, come
   * from the list loaded with the page. Opened before an operator deactivated
   * a writing connection during an incident, a later save sent writes on and
   * — the upsert storing the row active — brought it back with its writes,
   * while the screen said nothing. The form sends what it showed (`expected`);
   * when the row is no longer that, the save is refused and names who changed
   * it, so the builder reloads and decides on what is true now. API callers
   * send nothing and are not checked; their response says when a save
   * reactivated the row.
   */
  if (input.expected !== undefined) {
    const stale =
      input.expected === null
        ? existing !== null
        : existing === null ||
          existing.isActive !== input.expected.isActive ||
          existing.writeEnabled !== input.expected.writeEnabled;
    if (stale) return { refusal: studioError("CONFLICT", await staleFormRefusal(organizationId, key, existing)) };
  }

  /*
   * WRITES ARE LIVE ONLY ON AN ACTIVE ROW, judged as PATCH judges them
   * (`isActive && writeEnabled`). The upsert always leaves the row active, so
   * re-saving a connection an operator DEACTIVATED, with writes kept on,
   * makes it writable again. Reading `writeEnabled` alone called that a plain
   * secret save: the passkey was asked as `connection.save_secrets` and the
   * audit row said nothing about writes or the reactivation (P0.3 review
   * round 1).
   */
  const writableBefore = existing ? existing.isActive && existing.writeEnabled : false;
  /** The upsert stores the row active, so writes are live exactly when kept on. */
  const writableAfter = writeEnabled;
  /*
   * WRITES ARE ALLOWED FOR A SYSTEM, NOT FOR A ROW ID (P0.3 review round 2).
   * A DEV connection that allows writes, re-saved with Environment PROD and
   * the client's PROD host and writes kept on, switches writes on in PROD for
   * the first time. Judged per row it was "already writable", so the passkey
   * was asked as `connection.save_secrets` and the audit row named neither
   * the old environment nor either host. A save that keeps writes on while
   * changing the environment, the SAP host or base path (review round 3: a
   * gateway routes by path) or the SAP client is enabling them on the new
   * system — the same rule the form uses to untick its box.
   */
  const targetChanges =
    existing && writableBefore && writableAfter
      ? writeTargetChanges(existing, { environment, baseUrl: input.baseUrl, client: input.client ?? null })
      : [];
  /** Writes were live, stay on, and now land in another system. */
  const movesLiveWrites = targetChanges.length > 0;
  /** Writes go from not live (off, deactivated, a new row, another system) to live: the governance action. */
  const enablesWrites = writableAfter && (!writableBefore || movesLiveWrites);
  /** A re-save of a writing connection that does not keep its writes on. */
  const disablesWrites = writableBefore && !writableAfter;
  /** The upsert stores the row active, so a save over a deactivated row brings it back. */
  const reactivates = existing !== null && !existing.isActive;

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
    return {
      refusal: studioError(
        "VALIDATION_ERROR",
        `key: "${key}" is already the key of a tenant configured on this deployment, so the console ` +
          `could not tell your connection from it. Choose another key.`,
      ),
    };
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
  if (environment) {
    const twin = await findActiveTwin({
      organizationId,
      product: input.product,
      environment,
      client: input.client ?? null,
      excluding: { key },
    });
    if (twin) {
      return {
        refusal: studioError(
          "VALIDATION_ERROR",
          twinRefusal(twin, { product: input.product, environment, client: input.client ?? null }, "this one"),
        ),
      };
    }
  }

  return { existing, writableAfter, targetChanges, movesLiveWrites, enablesWrites, disablesWrites, reactivates };
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

  const environment = normalizeEnvironment(input.environment);
  const writeEnabled = input.writeEnabled ?? false;

  /*
   * JUDGED ON THE ROW IT OVERWRITES (P0.3 review round 3). The row is read and
   * judged, the passkey asked, and the bundle sealed; only then is it written.
   * A Deactivate landing in between was overwritten — the row came back
   * active and writing — while the response, the step-up action and the
   * audit row all described the row as it had been, and a form's `expected`
   * had been checked against a row that no longer existed. The upsert now
   * locks the row and writes only while it is still the one judged here;
   * otherwise nothing is written and the save is judged again.
   */
  let judged: SaveJudgement;
  let saved: Awaited<ReturnType<typeof upsertSapConnection>>;
  /*
   * The warn-mode admission of the latest judgement, recorded ONCE when the
   * save ends (review round 4). Recorded per attempt, a save judged again
   * after the row changed left two un-stepped-up governance actions in the
   * trail for one save — one of them, a secret save over the row as it had
   * been, never performed.
   */
  let missing: StepUpMissing | null = null;
  /*
   * THE PROBE OF THE NEW SECRET (P0.14, rotation.ts). Observe by default:
   * never refused, and the response and audit row say what SAP answered.
   */
  const probeMode = rotationProbeMode();
  /** The latest attempt's probe: what the save's audit row and response say. */
  let probe: RotationProbeResult | null = null;
  /*
   * A PROBE THAT REACHED SAP IS ON THE RECORD WHATEVER HAPPENS TO THE SAVE
   * (wave 2 integration review round 3). It sent the new credentials to the
   * client's SAP, and the only row that said so was the save's own, written
   * after the upsert: a save that then failed to seal (500), lost the row
   * three times (409), or was refused when judged again left SAP requests
   * nobody could see. The A.3 #9 exemption for this route says the probe is
   * recorded; `unsaved` makes that true on every way out that does not reach
   * the save's audit row. A probe that refused the save is on its own row.
   */
  let probesRan = 0;
  let probedConnectionId: string | null = null;
  let lastRan: RotationProbeRecord | null = null;
  const unsaved = async (response: Response, reason: string): Promise<Response> => {
    if (probesRan > 0 && probedConnectionId !== null) {
      await writeConfigAudit({
        organizationId,
        actorId: userId,
        entityType: "Connection",
        entityId: probedConnectionId,
        action: "TEST_CONNECT",
        // What happened, never what was typed.
        after: {
          event: "connection_rotation_probed",
          product: input.product,
          key,
          probes: probesRan,
          saved: false,
          reason,
          ...(lastRan ? { rotationProbe: { ...lastRan } } : {}),
        },
      });
    }
    return response;
  };
  const secrets = {
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
    // Never `writeSecret`: nothing reads one, so it is not sealed (file header).
  };
  for (let attempt = 1; ; attempt += 1) {
    const verdict = await judgeSave(organizationId, key, input, environment, writeEnabled);
    if ("refusal" in verdict) return unsaved(await withStepUpRecorded(missing, verdict.refusal), "refused_when_judged_again");
    judged = verdict;

    /*
     * A FRESH PASSKEY before a client's SAP credentials are sealed — and before
     * writes are switched on, which only this path can do (lib/auth/step-up.ts).
     * Asked after every validation above, so a form with a mistake in it is
     * refused for the mistake, not for the passkey.
     */
    const stepUp = checkStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
      // Turning writes on is recorded as what it is, not as a secret save.
      action: judged.enablesWrites ? "connection.enable_writes" : "connection.save_secrets",
      targetId: judged.existing?.id ?? null,
    });
    if (!stepUp.ok) return unsaved(stepUp.response, "step_up_required");
    missing = stepUp.outcome === "warned" ? stepUp.missing : null;

    /*
     * THE STORED API-KEY HEADER, KEPT WHEN ASKED (wave 2 rotation probe review
     * round 2). A form re-save sends no header name (it is sealed, so the form
     * cannot show it) and asks for the stored one: from the row this attempt
     * judged, so the probe and the save both send the key in the header the
     * connection uses. Only the name is read back; it is never logged.
     */
    const keptHeader =
      input.authType === "api-key" && !input.apiKeyHeader && input.keepStoredApiKeyHeader === true && judged.existing
        ? await storedApiKeyHeader(organizationId, input.product, key, judged.existing)
        : null;
    const attemptSecrets = keptHeader ? { ...secrets, apiKeyHeader: keptHeader } : secrets;

    /*
     * PROBE BEFORE SWAP (P0.14, rotation.ts, rotation-probe.ts). Re-saving a
     * connection is how its secret is rotated, and the save writes the new
     * one unconditionally: a mistyped password takes every lane on that
     * system down. So when the row being replaced is active and its secret
     * works by the record (its last probe was OK, or a lane proved a read
     * through it), and the save changes the sign-in credentials on the same
     * system, the new credentials are sent to SAP once first, with nothing
     * written: the sign-in and the probe path's $metadata.
     *
     * Under observe (the default) the answer is reported, never acted on.
     * Under enforce the save is refused only when SAP refused the sign-in
     * with the new secret (rotation.ts `probeOutcome`) while the stored one
     * is known to work; no answer, a slow service or a row that will not
     * open saves (wave 2 final review round 3). After step-up, so nothing
     * reaches SAP for a caller who has not passed it; judged on the row this
     * attempt judged (P0.3 review round 3).
     */
    const current = judged.existing;
    const candidate: ResolvedSapConnection = {
      source: "db",
      id: current?.id ?? "",
      organizationId,
      product: input.product,
      key,
      label: input.label,
      baseUrl: input.baseUrl.replace(/\/+$/, ""),
      authType: input.authType,
      secrets: attemptSecrets,
      oauthTokenUrl: input.oauthTokenUrl ?? null,
      writeEnabled,
      apiPath: input.apiPath ?? null,
      timeoutMs: input.timeoutMs ?? null,
      environment,
      client: input.client ?? null,
    };
    probe = await probeForSave({ organizationId, mode: probeMode, existing: current, candidate });
    if (probe.refused && current) {
      // The attempt is on the record: what SAP answered, never what was typed.
      await writeConfigAudit({
        organizationId,
        actorId: userId,
        entityType: "Connection",
        entityId: current.id,
        action: "TEST_CONNECT",
        after: { event: "connection_rotation_refused", product: input.product, key, rotationProbe: { ...probe.record } },
      });
      return unsaved(
        await withStepUpRecorded(missing, studioError("VALIDATION_ERROR", rotationRefusal(input.authType, probe.detail))),
        "rotation_refused",
      );
    }
    if (probe.record.ran && current) {
      probesRan += 1;
      probedConnectionId = current.id;
      lastRan = probe.record;
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
    try {
      saved = await upsertSapConnection({
        organizationId,
        product: input.product,
        key,
        label: input.label,
        baseUrl: input.baseUrl,
        authType: input.authType,
        secrets: attemptSecrets,
        oauthTokenUrl: input.oauthTokenUrl ?? null,
        environment,
        client: input.client ?? null,
        writeEnabled,
        apiPath: input.apiPath ?? null,
        timeoutMs: input.timeoutMs ?? null,
        expectedRow: judged.existing,
      });
      break;
    } catch (error) {
      /*
       * The row changed after it was judged (review round 3): deactivated,
       * toggled, re-saved or created meanwhile. Nothing was written. Judged
       * again on what is there now — a form that showed the old row is then
       * refused as stale, an API caller is told what its save does to the new
       * one, and the passkey is asked for that action.
       */
      if (error instanceof SapConnectionChangedError) {
        if (attempt < MAX_SAVE_ATTEMPTS) continue;
        return unsaved(
          await withStepUpRecorded(
            missing,
            studioError(
              "CONFLICT",
              `The connection "${key}" kept changing while this save was being made, so nothing was saved. ` +
                "Reload the page to see it as it is, then save again.",
            ),
          ),
          "conflict",
        );
      }
      console.error("[studio/connections] seal or persist failed:", error);
      return unsaved(
        await withStepUpRecorded(
          missing,
          studioError(
            "INTERNAL",
            "The connection could not be sealed and was not saved. This is a deployment " +
              "configuration problem, not a problem with what you entered — quote the " +
              "correlation ID to whoever operates this environment.",
          ),
        ),
        "seal_or_persist_failed",
      );
    }
  }
  if (missing) await recordStepUpMissing(missing);
  const { existing, writableAfter, targetChanges, movesLiveWrites, enablesWrites, disablesWrites, reactivates } =
    judged;

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
  /*
   * A RE-SAVE THAT TURNS WRITES OFF SAYS SO. Not refused — off is the safe
   * direction, and an API caller re-saving credentials keeps working — but a
   * writing integration that stops at its next create deserves a sentence now,
   * not a 403 later. The form keeps writes on by default (P0.3).
   */
  const writesOffNotice = disablesWrites
    ? "Writes are now OFF on this connection: this save did not keep them on. Every create through it is refused until it is saved again with Allow writes ticked."
    : null;
  /*
   * A SAVE THAT REACTIVATES A CONNECTION SAYS SO (P0.3 review round 2). An
   * operator may have stopped it on purpose; the form refuses a save made on
   * a stale view of the row, and every other caller is told here.
   */
  const reactivatedNotice = reactivates
    ? `This connection had been deactivated, and saving it made it active again${writableAfter ? ", with writes on" : ""}. ` +
      "Deactivate it again if it was stopped on purpose."
    : null;

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
      // The system the row now points at, beside what it pointed at before
      // (P0.3 review round 2): writes are allowed for a system, so the trail
      // must say which one. The base URL is a non-secret hostname (file header).
      baseUrl: input.baseUrl,
      client: input.client ?? null,
      writeEnabled,
      // What the save did to writes, so the trail answers "who turned them on/off".
      // isActiveBefore: a save always leaves the row active, so a re-save of
      // a deactivated connection is a reactivation, and the trail says so.
      ...(existing
        ? {
            writeEnabledBefore: existing.writeEnabled,
            isActiveBefore: existing.isActive,
            environmentBefore: existing.environment,
            baseUrlBefore: existing.baseUrl,
            clientBefore: existing.client,
          }
        : {}),
      ...(enablesWrites ? { writesEnabled: true } : {}),
      ...(movesLiveWrites ? { writeTargetChanged: targetChanges } : {}),
      ...(disablesWrites ? { writesDisabled: true } : {}),
      ...(reactivates ? { reactivated: true } : {}),
      secretsRotated: true,
      // What the probe of the new secret did, truthfully (rotation.ts): the
      // mode, whether a request reached SAP, what SAP answered, and why.
      // Facts only, never a secret. Replaces `rotationProbed`, which said
      // "proven" for probes that sent nothing (wave 2 final review round 3).
      ...(probe ? { rotationProbe: { ...probe.record } } : {}),
      // A save judged again after the row changed may have probed more than once.
      ...(probesRan > 1 ? { rotationProbes: probesRan } : {}),
      ...(warning ? { sfBasicAuthSunsetWarned: true } : {}),
    },
  });

  /*
   * The save changed a secret the broker must open for the product, so the
   * group's statuses follow what the broker now does (P0.2 review rounds
   * 5-7; connection-probe-sweep.ts `settleConnectionGroup`): cleared when the
   * set opens, GROUP_UNREADABLE / UNREADABLE when it still does not —
   * whatever the saved row held before. After the audit row and best effort:
   * the save has committed, so a fault here must not answer "not saved".
   */
  await settleConnectionGroup(organizationId, input.product);

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

  /*
   * What the probe found, for the form (wave 2 final review round 3): a
   * secret SAP refused, or one it could not check, is saved under observe and
   * said so here, not discovered at the next failed call.
   */
  const rotationWarning = probe ? rotationProbeWarning(probe.record, input.authType, probe.detail) : null;

  return studioOk({
    connection: saved,
    replaced: Boolean(existing),
    ...(probe ? { rotationProbe: { ...probe.record, warning: rotationWarning } } : {}),
    ...(warning ? { warning } : {}),
    ...(writesOffNotice ? { writesTurnedOff: true, writesNotice: writesOffNotice } : {}),
    ...(reactivatedNotice ? { reactivated: true, reactivatedNotice } : {}),
  });
}

/**
 * The 409 for a save made on a view of the row that is no longer true (P0.3
 * review round 2): what the row is now, and who changed it last and when, so
 * the builder can ask them before undoing an incident response.
 */
async function staleFormRefusal(
  organizationId: string,
  key: string,
  existing: { id: string; isActive: boolean; writeEnabled: boolean } | null,
): Promise<string> {
  if (existing === null) {
    return `The connection "${key}" this form was replacing no longer exists. Reload the page and save it again.`;
  }
  const now = existing.isActive
    ? existing.writeEnabled
      ? "active, with writes allowed"
      : "active, with writes off"
    : existing.writeEnabled
      ? "deactivated (its writes stay off while it is)"
      : "deactivated";
  const last = await prisma.configAudit.findFirst({
    where: { organizationId, entityType: "Connection", entityId: existing.id, action: { in: ["CREATE", "UPDATE"] } },
    orderBy: { at: "desc" },
    select: { actorId: true, at: true },
  });
  const actor = last
    ? await prisma.user.findFirst({ where: { id: last.actorId, organizationId }, select: { name: true, email: true } })
    : null;
  const who = last ? ` ${actor?.name ?? actor?.email ?? "Someone"} changed it at ${last.at.toISOString()}.` : "";
  return (
    `The connection "${key}" has changed since this page was loaded: it is now ${now}.${who} ` +
    "Nothing was saved. Reload the page to see it as it is, then save again if the change should still be made."
  );
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

  /*
   * JUDGED ON THE ROW IT OVERWRITES (P0.3 review round 4), as POST is. The
   * twin check, the "writes are switched on by a save" refusal and the
   * passkey decision are made on a read, and the update used to write
   * whatever had happened since. An operator's Deactivate (or writes-off)
   * landing between the two was undone: a builder with no passkey, whose
   * PATCH {isActive: true} had read the row while it was still active and
   * writing, switched it back on past both gates. The update now writes only
   * while the row still holds the state that was judged; otherwise nothing
   * is written and the toggle is judged again on the row as it now is.
   */
  /** The row as judged by the attempt that wrote: the state the update replaced. */
  let existing: { id: string; product: string; isActive: boolean };
  let updated: { id: string; isActive: boolean; writeEnabled: boolean };
  /** The warn-mode admission of the judgement acted on, recorded once (review round 4). */
  let missing: StepUpMissing | null = null;
  for (let attempt = 1; ; attempt += 1) {
    // Scoped find before update: a bare update by id would let one organization
    // toggle another's connection.
    const row = await prisma.sapConnection.findFirst({
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
    if (!row) return withStepUpRecorded(missing, studioError("NOT_FOUND", "Connection not found."));
    existing = row;

    /*
     * ACTIVATING A TWIN IS A TYPED 409, NOT AN EMPTY 500 (P0.1, A52). POST
     * refuses a second active connection the binding could not tell apart; this
     * toggle — what Studio's "Activate" sends — did not, so reactivating B
     * after A had replaced it hit the partial unique index and Next answered a
     * bare 500 with no body. Same lookup and words as POST; CONFLICT, because
     * the request is well-formed and the other row's state is what stands in
     * the way.
     */
    const activating = isActive === true && !row.isActive;
    if (activating && row.environment) {
      const target = { product: row.product, environment: row.environment, client: row.client ?? null };
      const twin = await findActiveTwin({ organizationId, ...target, excluding: { id: row.id } });
      if (twin) return withStepUpRecorded(missing, studioError("CONFLICT", twinRefusal(twin, target, "this connection")));
    }

    // Writes are switched on by a save from the Connections form (POST), one
    // door: the save says which system the writes are for (environment, host,
    // SAP client), records them on its audit row and asks for the passkey as
    // `connection.enable_writes`. Not because of a write secret, which nothing
    // reads (file header; wave 2 integration review round 3).
    if (writeEnabled === true && !row.writeEnabled) {
      return withStepUpRecorded(
        missing,
        studioError(
          "VALIDATION_ERROR",
          "Writes are switched on by saving the connection from the Connections form with Allow writes ticked, so the save records which SAP system they are for.",
        ),
      );
    }

    /*
     * A FRESH PASSKEY WHEN THIS TURNS WRITES ON. The check above refuses to
     * enable writes outright, but reactivating a deactivated connection that
     * still carries writeEnabled turns a write path back on all the same.
     * Turning things OFF stays one press: it is the direction an incident needs.
     * Checked without I/O, so a warn-mode admission is recorded once, for the
     * judgement the update acted on (review round 4).
     */
    const writableBefore = row.isActive && row.writeEnabled;
    const after = { isActive: isActive ?? row.isActive, writeEnabled: writeEnabled ?? row.writeEnabled };
    missing = null;
    if (after.isActive && after.writeEnabled && !writableBefore) {
      const stepUp = checkStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
        action: "connection.enable_writes",
        targetId: row.id,
      });
      if (!stepUp.ok) return stepUp.response;
      if (stepUp.outcome === "warned") missing = stepUp.missing;
    }

    let written: number;
    try {
      // Only while the row still holds the state judged above: a toggle or
      // save landing meanwhile makes this match nothing.
      ({ count: written } = await prisma.sapConnection.updateMany({
        where: { id: row.id, organizationId, isActive: row.isActive, writeEnabled: row.writeEnabled },
        data: {
          ...(isActive === undefined ? {} : { isActive }),
          ...(writeEnabled === undefined ? {} : { writeEnabled }),
        },
      }));
    } catch (error) {
      // A twin activated between the check above and this write: the index
      // decides the race, and the loser gets the same typed refusal.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return withStepUpRecorded(
          missing,
          studioError(
            "CONFLICT",
            "Another connection for the same product, environment and SAP client was activated a moment ago. Reload to see it; deactivate it first if this one should serve.",
          ),
        );
      }
      throw error;
    }
    if (written === 1) {
      updated = { id: row.id, ...after };
      break;
    }
    if (attempt >= MAX_SAVE_ATTEMPTS) {
      return withStepUpRecorded(
        missing,
        studioError(
          "CONFLICT",
          "The connection kept changing while this change was being made, so nothing was changed. " +
            "Reload the page to see it as it is, then try again.",
        ),
      );
    }
  }
  if (missing) await recordStepUpMissing(missing);

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

  /*
   * The product's set changed, so its statuses follow what the broker now
   * does (P0.2 review rounds 5-7; connection-probe-sweep.ts
   * `settleConnectionGroup`). Deactivating the row that will not open is a
   * remedy the "will not open" answer names: its siblings stop reading
   * refused. Activating one that will not open makes the set refused: it and
   * its siblings say so at once, not after the next nightly sweep. After the
   * audit row and best effort: the toggle has committed, and a fault here
   * must not hide who made it or answer 500 for it.
   */
  if (existing.isActive !== updated.isActive) {
    await settleConnectionGroup(organizationId, existing.product);
  }

  return studioOk({ connection: updated });
}
