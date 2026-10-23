/**
 * The CoreEdge capability registry (P0.15): what CoreEdge can do TODAY, as the
 * gap simulator scores it, derived from the code instead of rated by hand.
 *
 * WHY. `docs/coreedge/gap-matrix.json` used to carry a hand-rated
 * `coreedgeToday` block, and the roadmap's sections 3 and 8.1 were that block
 * run through `scripts/coreedge/simulate-gap-matrix.mjs`. Nothing tied a cell
 * to the code: custom service paths (P1.1) landed and the matrix still said
 * customer-built APIs were refused; private networks were credited although
 * the hosted instance refuses private hosts. A claim could drift from the code
 * the moment either changed.
 *
 * HOW A CELL IS SCORED. The roadmap defines the three levels (section 2.3):
 * full = works end to end in code, is tested and documented, and has no
 * material limit; partial = exists, with a material limit; none = absent. So
 * every cell here is three questions, answered from the code:
 *
 *   1. Is it IMPLEMENTED? Derived from code flags — the connector's product
 *      registry, the OData versions a service path may carry, the host
 *      allow-list, the key providers built in, the starter kit's files — or,
 *      where the fact lives in a module that reaches the database, declared in
 *      BROKER_FACTS below and asserted against that module by
 *      tests/unit/coreedge/capability-registry.test.ts.
 *   2. What LIMITS does it carry? Each is a sentence naming the code that
 *      imposes it; the same test checks the ones that can be checked.
 *   3. Is there EVIDENCE for full: tests and a document that exist (the test
 *      checks the paths), and no limit?
 *
 *   not implemented            -> none
 *   implemented, any limit     -> partial
 *   implemented, no evidence   -> partial ("no evidence recorded")
 *   implemented, evidence      -> full
 *
 * So a cell can only rise when the code does and the evidence exists, and it
 * falls the moment the code stops doing it. Raising a cell means changing the
 * code (and the facts the test checks), or recording evidence here.
 *
 * HOSTING. The roadmap's headline is the hosted instance (`SHARED`, the one
 * production deployment). Network reach depends on where CoreEdge runs, so it
 * is scored per hosting mode (caveat 8d); the simulator reports each mode, and
 * the headline uses SHARED. That is what corrects the over-credit in caveat 4.
 *
 * GENERATED OUTPUT. `pnpm coreedge:registry` writes
 * docs/coreedge/capability-registry.json, which the simulator (plain Node, no
 * TypeScript) reads in place of the matrix's old `coreedgeToday`. CI runs it
 * with --check, and the unit test fails when the JSON and this module differ.
 *
 * PURE, AND LIGHT. Imported by a tsx script and by tests, never by a route, so
 * it imports only modules that do not reach the database.
 */

import { checkRegistry, NORTHBOUND_API_VERSIONS, type NorthboundApiVersion } from "@/lib/northbound/version-policy";
import { BUILT_IN_KEY_PROVIDER_NAMES } from "@/lib/sap-public/keys/key-provider";
import { ODATA_VERSIONS, validateServicePath } from "@/lib/sap-public/service-path";
import { SAP_ODATA_PRODUCTS, type SapOdataProduct } from "@/lib/sap-public/tdd-connector";
import { isForbiddenBaseUrlHost } from "@/lib/studio/connection-url-guard";
import { grantBindingMode } from "@/lib/studio/grant-binding";
import { SAP_HOST_SUFFIXES } from "@/lib/studio/sap-host-allowlist";
import { buildScaffold } from "@/lib/studio/scaffold";

/* ── vocabulary (the matrix's dimension values) ───────────────────────── */

export type Level = "none" | "partial" | "full";

export const TARGETS = [
  "S4_PUBLIC",
  "S4_PRIVATE_RISE",
  "S4_ONPREM",
  "ECC",
  "SUCCESSFACTORS",
  "ARIBA",
  "CONCUR",
  "BTP_SERVICE",
  "NON_SAP_SAAS",
] as const;
/** Caveat 8a: targets the core model leaves out. Scored in the extended model only. */
export const EXTENDED_TARGETS = [
  "SAP_SALES_SERVICE_CLOUD",
  "SAP_FIELDGLASS",
  "SAP_IBP",
  "SAP_BYDESIGN",
  "SAP_BUSINESS_ONE",
  "SAP_COMMERCE_CLOUD",
] as const;
export type Target = (typeof TARGETS)[number] | (typeof EXTENDED_TARGETS)[number];

export const TECHS = ["ODATA_V2", "ODATA_V4", "SOAP", "REST", "RFC_BAPI", "IDOC", "EVENTS", "FILE_SFTP"] as const;
/** Caveat 8b. */
export const EXTENDED_TECHS = ["DATA_PRODUCT", "BINARY_MEDIA"] as const;
export type Tech = (typeof TECHS)[number] | (typeof EXTENDED_TECHS)[number];

export const PATTERNS = [
  "SYNC_READ",
  "SYNC_CREATE",
  "SYNC_UPDATE_DELETE_ACTION",
  "EVENT_TO_APP",
  "SAP_CALLS_OUT",
  "A2A_FLOW_WITH_MAPPING",
  "BULK_BATCH",
  "B2B_EDI",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const ORIGINS = ["SAP_STANDARD", "CUSTOMER_CUSTOM", "PARTNER"] as const;
export const NETWORKS = ["PUBLIC_INTERNET", "SAP_SIDE_IP_ALLOWLIST", "PRIVATE_NETWORK"] as const;
export type Network = (typeof NETWORKS)[number];
export const SAP_AUTHS = [
  "BASIC",
  "OAUTH_CLIENT_CREDENTIALS",
  "OAUTH_SAML_BEARER",
  "X509_MTLS",
  "PRINCIPAL_PROPAGATION",
  "API_KEY",
] as const;
export type SapAuth = (typeof SAP_AUTHS)[number];

export const CONSUMERS = [
  "JS_TS",
  "PYTHON",
  "JAVA",
  "DOTNET",
  "ABAP_ONPREM",
  "ABAP_CLOUD",
  "LOW_CODE",
  "AI_AGENT",
  "HUMAN_TESTER",
] as const;
/** Caveat 8c. */
export const EXTENDED_CONSUMERS = ["GO", "PHP", "MOBILE", "SAP_CAP", "SAP_BUILD"] as const;
export type Consumer = (typeof CONSUMERS)[number] | (typeof EXTENDED_CONSUMERS)[number];

export const CONSUMER_AUTHS = ["STATIC_BEARER", "OAUTH_CLIENT_CREDENTIALS", "MTLS", "USER_DELEGATED_OIDC"] as const;
export type ConsumerAuth = (typeof CONSUMER_AUTHS)[number];

/** Caveat 8d: where CoreEdge runs. SHARED is the production deployment and the headline. */
export const HOSTINGS = ["SHARED", "DEDICATED", "SELF_HOSTED", "CONNECTOR"] as const;
export type Hosting = (typeof HOSTINGS)[number];
export const HEADLINE_HOSTING: Hosting = "SHARED";

/** The 13 stages the roadmap scored, then the five section 3.8 said were missing. */
export const LIFECYCLE_STAGES = [
  "DISCOVER",
  "DESIGN_MAP",
  "MOCK_TEST_BEFORE_CODE",
  "DEVELOP_SDK_CODEGEN",
  "CI_PRECOMMIT_GOVERNANCE",
  "DEPLOY_PROMOTE_ENVIRONMENTS",
  "RUN_MONITOR_ALERT",
  "GOVERN_AUDIT_COMPLY",
  "SECRETS_KEYS",
  "SAP_UPGRADE_IMPACT",
  "SELF_HOST_SETUP",
  "AI_ASSIST",
  "ONBOARDING_TIME_TO_FIRST_CALL",
  "PROVIDER_BUILD_TRANSPORT",
  "API_VERSIONING",
  "PERFORMANCE_TEST",
  "SUPPORT_INCIDENT",
  "RETIRE",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/* ── facts the registry reads straight from the code ──────────────────── */

/**
 * Which connector product serves each target. Null: no product exists. The
 * test pins this against the connector's registry both ways, so a product
 * added to SAP_ODATA_PRODUCTS without a row here fails.
 */
export const TARGET_PRODUCTS: Readonly<Record<Target, string | null>> = {
  S4_PUBLIC: "s4hana",
  S4_PRIVATE_RISE: "cloud-erp-private",
  S4_ONPREM: "s4hana-onprem",
  ECC: "ecc",
  SUCCESSFACTORS: "successfactors",
  // A known product, but REST and not on the broker: getSapProduct returns an
  // OData placeholder with no services, outside SAP_ODATA_PRODUCTS.
  ARIBA: "ariba",
  // concursolutions.com is on the host allow-list, but no product exists.
  CONCUR: null,
  BTP_SERVICE: null,
  NON_SAP_SAAS: null,
  SAP_SALES_SERVICE_CLOUD: null,
  // fieldglass.net is on the host allow-list, but no product exists.
  SAP_FIELDGLASS: null,
  SAP_IBP: null,
  SAP_BYDESIGN: null,
  SAP_BUSINESS_ONE: null,
  SAP_COMMERCE_CLOUD: null,
};

const ODATA_TECH_OF_VERSION: Readonly<Record<(typeof ODATA_VERSIONS)[number], Tech>> = {
  V2: "ODATA_V2",
  V4: "ODATA_V4",
};
const CATALOGUE_PROTOCOL_OF_TECH: Readonly<Partial<Record<Tech, string>>> = {
  ODATA_V2: "ODATAV2",
  ODATA_V4: "ODATAV4",
};

/** A sample of the service roots a customer or partner builds (P1.1). */
const SAMPLE_CUSTOM_PATHS = {
  CUSTOMER_CUSTOM: ["/sap/opu/odata/sap/ZUI_TRAVEL_O2", "/sap/opu/odata/sap/YY1_SALESORDER_CDS"],
  PARTNER: ["/sap/opu/odata/abc/PARTNER_SERVICE_SRV"],
} as const;

/** Hosts a private landscape uses. The connection guard must refuse every one. */
const SAMPLE_PRIVATE_HOSTS = ["https://10.20.30.40", "https://s4.corp.internal", "https://erp.local", "https://[fd00::1]"];

export interface CodeFacts {
  /** OData versions a service path may carry, as matrix technologies. */
  readonly brokerTechs: readonly Tech[];
  readonly odataProducts: readonly string[];
  /** Per OData product: the matrix technologies its catalogue lists services for. */
  readonly catalogueTechs: Readonly<Record<string, readonly Tech[]>>;
  /** Origins whose sample paths validateServicePath accepts. */
  readonly servicePathOrigins: readonly string[];
  readonly publicHostSuffixes: number;
  readonly privateHostsRefused: boolean;
  readonly keyProviders: readonly string[];
  readonly grantBindingDefault: string;
  /** Files the Studio starter kit writes. */
  readonly starterKitFiles: readonly string[];
  /**
   * The dated northbound API versions registered, oldest first, when the
   * registry keeps the deprecation policy (version-policy.ts checkRegistry);
   * none when it breaks it (P1.10).
   */
  readonly northboundApiVersions: readonly string[];
}

/** The registered northbound versions, or none when the registry breaks the deprecation policy (P1.10). */
export function registeredApiVersions(registry: readonly NorthboundApiVersion[] = NORTHBOUND_API_VERSIONS): string[] {
  return checkRegistry(registry).length === 0 ? registry.map((v) => v.version) : [];
}

export function readCodeFacts(): CodeFacts {
  const catalogueTechs: Record<string, Tech[]> = {};
  for (const p of SAP_ODATA_PRODUCTS) {
    catalogueTechs[p.key] = (Object.entries(CATALOGUE_PROTOCOL_OF_TECH) as [Tech, string][])
      // An absent protocol means V2 (tdd-connector.ts SapServiceDefinition).
      .filter(([, protocol]) => p.services.some((s) => (s.protocol ?? "ODATAV2") === protocol))
      .map(([tech]) => tech);
  }
  const kit = buildScaffold({
    id: "registry",
    name: "Registry sample",
    externalId: "API_BUSINESS_PARTNER",
    sapProduct: "s4hana",
    operation: "READ",
    entitySet: "A_BusinessPartner",
    version: 1,
    solutionName: "Registry sample",
  });
  return {
    brokerTechs: ODATA_VERSIONS.map((v) => ODATA_TECH_OF_VERSION[v]),
    odataProducts: SAP_ODATA_PRODUCTS.map((p: SapOdataProduct) => p.key),
    catalogueTechs,
    servicePathOrigins: (Object.entries(SAMPLE_CUSTOM_PATHS) as [string, readonly string[]][])
      .filter(([, paths]) => paths.every((path) => validateServicePath(path).ok))
      .map(([origin]) => origin),
    publicHostSuffixes: SAP_HOST_SUFFIXES.length,
    privateHostsRefused: SAMPLE_PRIVATE_HOSTS.every((h) => isForbiddenBaseUrlHost(h)),
    keyProviders: [...BUILT_IN_KEY_PROVIDER_NAMES],
    grantBindingDefault: grantBindingMode({} as NodeJS.ProcessEnv),
    starterKitFiles: kit.map((f) => f.path),
    northboundApiVersions: registeredApiVersions(),
  };
}

/* ── facts declared here and asserted against the code by the test ────── */

/**
 * What the broker does, where the module that does it reaches the database
 * (so this registry may not import it). Every value is checked against the
 * real module in tests/unit/coreedge/capability-registry.test.ts — change the
 * broker, and the test names the line here to change with it.
 */
export const BROKER_FACTS = {
  /** read.ts: MAX_LIMIT, and the only query options a read sends. */
  readMaxRows: 100,
  readQueryOptions: ["$top", "$format"],
  /** access.ts (authorisation.ts interfaceRefusal) refuses every other write operation (OPERATION_NOT_SUPPORTED). */
  writeOperations: ["CREATE"],
  /** Neither executor sends $batch. */
  batch: false,
  /** The northbound routes a credential calls, relative to src/app/api/northbound. */
  northboundRoutes: [
    "interfaces/route.ts",
    "interfaces/[id]/data/route.ts",
    "interfaces/[id]/data/write/route.ts",
    "interfaces/[id]/schema/route.ts",
  ],
  /** Northbound routes that need no credential: the version changelog (P1.10). */
  northboundPublicRoutes: ["versions/route.ts"],
  /**
   * The versioned base path's directory (P1.10): every route above is also
   * served under it, by a file that re-exports the original handler.
   */
  northboundAliasDir: "v1",
  /** Machine prefixes reserved in rate-limit.ts that have no route yet. */
  unbuiltMachineRoutes: ["/api/twin", "/api/events/ingest", "/api/mgmt", "/api/outbound", "/api/mcp"],
  /** The SapAuthType union in connection-resolver.ts. */
  sapAuthTypes: ["basic", "bearer", "oauth-client-credentials", "oauth-saml-bearer", "api-key"],
  /** How a consumer authenticates: a bearer token looked up by hash (auth.ts), nothing else. */
  consumerAuth: ["STATIC_BEARER"],
  /** step-up.ts: the default of COREEDGE_STEP_UP. */
  stepUpDefault: "warn",
  /** audit.ts: a failed audit insert is logged and swallowed. */
  auditFailClosed: false,
  /** The write executor sends JSON only. */
  writeContentType: "application/json",
} as const;

/** Which SapAuthType implements each matrix login method, if any. */
const SAP_AUTH_IMPLEMENTATION: Readonly<Record<SapAuth, string | null>> = {
  BASIC: "basic",
  OAUTH_CLIENT_CREDENTIALS: "oauth-client-credentials",
  OAUTH_SAML_BEARER: "oauth-saml-bearer",
  X509_MTLS: null,
  PRINCIPAL_PROPAGATION: null,
  API_KEY: "api-key",
};

/* ── evidence for "full" ──────────────────────────────────────────────── */

/**
 * The cells with the evidence the roadmap's "full" needs: tests and a
 * document, and (where noted) a live run. The test checks every path exists.
 * A cell not listed here can be at most partial.
 */
export interface Evidence {
  readonly tests: readonly string[];
  readonly docs: readonly string[];
  readonly live?: string;
}

export const EVIDENCE: Readonly<Record<string, Evidence>> = {
  "targetTech:S4_PUBLIC|ODATA_V2": {
    tests: ["tests/unit/northbound/read.test.ts", "tests/unit/northbound/write.test.ts"],
    docs: ["docs/coreedge-abap-lab-guide.md"],
    live: "The S/4HANA Cloud Public demo tenant answered V2 reads (roadmap R1 section 7).",
  },
  "network:PUBLIC_INTERNET": {
    tests: ["tests/unit/coreedge/sap-host-allowlist.test.ts"],
    docs: ["docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md"],
    live: "Internet-facing SAP cloud hosts answered from the hosted instance (R1 section 7).",
  },
  "sapAuth:BASIC": {
    tests: ["tests/unit/sap-public/connection-binding.test.ts"],
    docs: ["docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md"],
    live: "The demo tenant's communication user (R1 section 7).",
  },
  "sapAuth:OAUTH_CLIENT_CREDENTIALS": {
    tests: ["tests/unit/northbound/credential-step.test.ts", "tests/unit/northbound/token-failure-retry-table.test.ts"],
    docs: ["docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md"],
  },
  "consumerAuth:JS_TS|STATIC_BEARER": {
    tests: ["tests/unit/northbound/auth.test.ts", "tests/unit/studio/scaffold-kit-contract.test.ts"],
    docs: ["docs/coreedge-abap-lab-guide.md"],
  },
  "lifecycle:API_VERSIONING": {
    tests: [
      "tests/integration/northbound-consumer-replay.test.ts",
      "tests/integration/northbound-versioning.test.ts",
      "tests/unit/northbound/version-policy.test.ts",
      "tests/unit/northbound/versioned-routes.test.ts",
    ],
    docs: ["docs/coreedge/api-changelog.md", "docs/coreedge-developer-guide.md"],
  },
};

/* ── the cell shape ───────────────────────────────────────────────────── */

export interface CapabilityCell {
  readonly row: string;
  readonly col: string;
  readonly status: Level;
  readonly note: string;
  /** What in the code the status rests on, in words, with the module. */
  readonly basis: readonly string[];
}

interface Judged {
  readonly implemented: boolean;
  readonly basis: readonly string[];
  readonly limits?: readonly string[];
  readonly evidenceKey?: string;
  /** A short label for the note when nothing else says what the cell is. */
  readonly what?: string;
}

function score(j: Judged): { status: Level; note: string } {
  if (!j.implemented) {
    return { status: "none", note: j.basis.join(" ") };
  }
  const limits = j.limits ?? [];
  const evidence = j.evidenceKey ? EVIDENCE[j.evidenceKey] : undefined;
  if (limits.length > 0) {
    // Without a short label, the basis says what the capability is.
    return { status: "partial", note: [j.what ?? j.basis.join(" "), ...limits].join(" ") };
  }
  if (!evidence) {
    return {
      status: "partial",
      note: [j.what, "No end-to-end test and document are recorded for it (capability-registry.ts EVIDENCE)."]
        .filter(Boolean)
        .join(" "),
    };
  }
  return {
    status: "full",
    note: [j.what, evidence.live ? `Live: ${evidence.live}` : "Tested and documented; no material limit."]
      .filter(Boolean)
      .join(" "),
  };
}

function cell(row: string, col: string, j: Judged): CapabilityCell {
  const { status, note } = score(j);
  return { row, col, status, note, basis: j.basis };
}

/* ── targetTech ───────────────────────────────────────────────────────── */

const TECH_LABEL: Readonly<Record<Tech, string>> = {
  ODATA_V2: "OData V2",
  ODATA_V4: "OData V4",
  SOAP: "SOAP",
  REST: "REST",
  RFC_BAPI: "RFC/BAPI",
  IDOC: "IDoc",
  EVENTS: "event",
  FILE_SFTP: "file or SFTP",
  DATA_PRODUCT: "data-product",
  BINARY_MEDIA: "binary media",
};

const NOT_ON_BROKER = (tech: Tech): string =>
  tech === "BINARY_MEDIA"
    ? `The broker carries JSON only: write.ts sends ${BROKER_FACTS.writeContentType} and read.ts parses JSON, so no OData media stream or attachment passes through it.`
    : tech === "DATA_PRODUCT"
      ? "Data products are a catalogue type (DATA_PRODUCT in prisma/schema.prisma), but the broker has no way to call one; it reads and creates over OData only."
      : `No ${TECH_LABEL[tech]} executor: the broker reads and creates over OData only (service-path.ts ODATA_VERSIONS; read.ts and write.ts).`;

/** Limits a target's OData cells carry, beyond what the code flags say. */
const TARGET_ODATA_LIMITS: Readonly<Partial<Record<string, readonly string[]>>> = {
  "S4_PUBLIC|ODATA_V4": [
    "Non-curated V4 service paths are derived from the API id and read unverified until a probe of that exact path answers 200 (hub-content.ts catalogueAddress; P0.8), and the curated V4 purchase-order service answered 403 on the demo tenant.",
  ],
  "S4_PRIVATE_RISE|ODATA_V2": [
    "Never run end to end: a RISE system is reachable only from a copy inside its network (see network).",
  ],
  "S4_PRIVATE_RISE|ODATA_V4": [
    "Never run end to end; non-curated V4 paths are derived and unverified until a probe answers 200 (hub-content.ts catalogueAddress).",
  ],
  "S4_ONPREM|ODATA_V2": ["Never run end to end: on-premise is reachable only from a copy inside its network."],
  "S4_ONPREM|ODATA_V4": [
    "Never run end to end; non-curated V4 paths are derived and unverified until a probe answers 200 (hub-content.ts catalogueAddress).",
  ],
  "ECC|ODATA_V2": [
    "ECC ships no service list (tdd-connector.ts), so only services registered by path work; never run end to end.",
  ],
  "ECC|ODATA_V4": ["Services registered by path only; never run end to end."],
  "SUCCESSFACTORS|ODATA_V2": [
    "Three curated keys, Hub OData V2 ids at the /odata/v2 root (resolve-hub-service.ts; P0.8) and registered paths; SAML bearer, the login SAP keeps after 20 Nov 2026, is not proven live (P0.9).",
  ],
  "SUCCESSFACTORS|ODATA_V4": ["Registered paths only; no SuccessFactors V4 service has been called."],
};

function targetTechCell(facts: CodeFacts, target: Target, tech: Tech): CapabilityCell {
  if (!facts.brokerTechs.includes(tech)) {
    return cell(target, tech, { implemented: false, basis: [NOT_ON_BROKER(tech)] });
  }
  const product = TARGET_PRODUCTS[target];
  if (product === null || !facts.odataProducts.includes(product)) {
    return cell(target, tech, {
      implemented: false,
      basis: [
        product === null
          ? "No connector product serves this target (tdd-connector.ts SAP_ODATA_PRODUCTS)."
          : `Product "${product}" is not an OData product on the broker (tdd-connector.ts getSapProduct).`,
      ],
    });
  }
  const catalogue = facts.catalogueTechs[product]?.includes(tech) ?? false;
  const basis = [
    `Product "${product}" is in SAP_ODATA_PRODUCTS (tdd-connector.ts).`,
    catalogue
      ? `Its catalogue lists ${TECH_LABEL[tech]} services.`
      : `Its catalogue lists no ${TECH_LABEL[tech]} service; a service registered by path (P1.1, service-path.ts) may carry ${TECH_LABEL[tech]}.`,
  ];
  return cell(target, tech, {
    implemented: true,
    basis,
    limits: TARGET_ODATA_LIMITS[`${target}|${tech}`] ?? [],
    evidenceKey: `targetTech:${target}|${tech}`,
    what: `${TECH_LABEL[tech]} on ${product}.`,
  });
}

/* ── techPattern ──────────────────────────────────────────────────────── */

function techPatternCell(facts: CodeFacts, tech: Tech, pattern: Pattern): CapabilityCell {
  if (!facts.brokerTechs.includes(tech)) {
    return cell(tech, pattern, { implemented: false, basis: [NOT_ON_BROKER(tech)] });
  }
  const label = TECH_LABEL[tech];
  switch (pattern) {
    case "SYNC_READ":
      return cell(tech, pattern, {
        implemented: true,
        basis: ["GET /api/northbound/interfaces/[id]/data (readEntitySet, read.ts)."],
        limits: [
          `Reads send only ${BROKER_FACTS.readQueryOptions.join(" and ")} and return at most ${BROKER_FACTS.readMaxRows} rows: no filter, key, select, expand or paging (read.ts).`,
        ],
        what: `${label} read.`,
      });
    case "SYNC_CREATE":
      return cell(tech, pattern, {
        implemented: (BROKER_FACTS.writeOperations as readonly string[]).includes("CREATE"),
        basis: ["POST /api/northbound/interfaces/[id]/data/write (writeEntitySet, write.ts) with a write key and an Idempotency-Key."],
        limits: [
          tech === "ODATA_V4"
            ? "V4 create is unit-tested only and has never been verified against a live tenant (P1.8)."
            : "Never verified against a live tenant (P1.8).",
        ],
        what: `${label} create.`,
      });
    case "SYNC_UPDATE_DELETE_ACTION":
      return cell(tech, pattern, {
        implemented: BROKER_FACTS.writeOperations.some((op) => op !== "CREATE"),
        basis: [
          `The executor performs ${BROKER_FACTS.writeOperations.join(", ")} only; access.ts refuses any other operation (OPERATION_NOT_SUPPORTED). No PATCH, DELETE or action.`,
        ],
      });
    case "BULK_BATCH":
      return cell(tech, pattern, {
        implemented: BROKER_FACTS.batch,
        basis: [`No $batch in read.ts or write.ts, and reads stop at ${BROKER_FACTS.readMaxRows} rows.`],
      });
    case "EVENT_TO_APP":
      return cell(tech, pattern, {
        implemented: false,
        basis: ["No subscription or webhook route: /api/events/ingest is a reserved rate-limit prefix with no route."],
      });
    case "SAP_CALLS_OUT":
      return cell(tech, pattern, {
        implemented: false,
        basis: ["No route for a call SAP starts: /api/outbound is a reserved prefix with no route; the broker only calls into SAP."],
      });
    case "A2A_FLOW_WITH_MAPPING":
      return cell(tech, pattern, {
        implemented: false,
        basis: ["One call reaches one API; there is no flow or mapping engine."],
      });
    case "B2B_EDI":
      return cell(tech, pattern, { implemented: false, basis: ["No EDI, AS2 or partner profiles."] });
  }
}

/* ── network, by hosting ──────────────────────────────────────────────── */

function networkCell(facts: CodeFacts, hosting: Hosting, network: Network): CapabilityCell {
  if (hosting === "CONNECTOR") {
    return cell(network, "", {
      implemented: false,
      basis: ["No CoreEdge connector exists (P4.2); this hosting mode cannot be deployed today."],
    });
  }
  const noDispatcher =
    "SAP calls use the platform fetch with no proxy, tunnel or dispatcher (read.ts, write.ts; P4.1).";
  switch (network) {
    case "PUBLIC_INTERNET":
      return cell(network, "", {
        implemented: facts.publicHostSuffixes > 0,
        basis: [`${facts.publicHostSuffixes} SAP host suffixes are allow-listed (sap-host-allowlist.ts).`],
        evidenceKey: "network:PUBLIC_INTERNET",
        what: "Internet-facing SAP cloud hosts.",
      });
    case "SAP_SIDE_IP_ALLOWLIST":
      if (hosting === "SHARED") {
        return cell(network, "", {
          implemented: false,
          basis: [
            "The hosted instance has no fixed egress address: no egress setting exists in the code, Vercel egress is dynamic unless Static IPs are bought [E47], and none is recorded for production (P4.4).",
            noDispatcher,
          ],
        });
      }
      return cell(network, "", {
        implemented: true,
        basis: [
          hosting === "DEDICATED"
            ? "A dedicated deployment can buy Vercel Static IPs for its own project [E47]; no code change is needed."
            : "A self-hosted copy calls out from the operator's own address.",
        ],
        limits: ["Never tested against an SAP system that allow-lists addresses."],
        what: "A fixed egress address the SAP side can allow-list.",
      });
    case "PRIVATE_NETWORK":
      if (hosting !== "SELF_HOSTED") {
        return cell(network, "", {
          implemented: false,
          basis: [
            facts.privateHostsRefused
              ? "Private hosts are refused: connection-url-guard.ts rejects IP literals, .local and .internal names."
              : "connection-url-guard.ts no longer refuses private hosts; re-score this cell.",
            noDispatcher,
          ],
        });
      }
      return cell(network, "", {
        implemented: true,
        basis: ["A copy inside the network reaches a private DNS name added with SAP_HOST_ALLOWLIST_EXTRA (sap-host-allowlist.ts)."],
        limits: [
          "DNS names only (IP literals refused), no custom CA or proxy, and never tested end to end.",
        ],
        what: "A self-hosted copy inside the customer network.",
      });
  }
}

/* ── origin ───────────────────────────────────────────────────────────── */

function originCells(facts: CodeFacts): CapabilityCell[] {
  const readLimit = `Reads send only $top and return at most ${BROKER_FACTS.readMaxRows} rows (read.ts).`;
  return [
    cell("SAP_STANDARD", "", {
      implemented: true,
      basis: ["SAP-published services resolve through the curated list or the Hub catalogue copy (resolve-hub-service.ts)."],
      limits: [
        "Non-curated V4 paths are derived and read unverified until a probe of that exact path answers 200; wrapper rows have no address (hub-content.ts catalogueAddress; P0.8).",
        readLimit,
      ],
      what: "SAP-published APIs.",
    }),
    cell("CUSTOMER_CUSTOM", "", {
      implemented: facts.servicePathOrigins.includes("CUSTOMER_CUSTOM"),
      basis: [
        facts.servicePathOrigins.includes("CUSTOMER_CUSTOM")
          ? "Z* and YY1_* services are registered by service path and verified from $metadata per environment (service-path.ts, service-verifications.ts; P1.1)."
          : "validateServicePath refuses Z* and YY1_* service roots.",
      ],
      limits: [readLimit, "No Z* or YY1_* call is recorded against a live tenant."],
      what: "Customer-built services.",
    }),
    cell("PARTNER", "", {
      implemented: facts.servicePathOrigins.includes("PARTNER"),
      basis: [
        facts.servicePathOrigins.includes("PARTNER")
          ? "A partner's namespaced Gateway service is registered by path on the same terms (service-path.ts; P1.1)."
          : "validateServicePath refuses namespaced partner service roots.",
      ],
      limits: [readLimit, "No partner service is recorded against a live tenant."],
      what: "Partner-built services.",
    }),
  ];
}

/* ── sapAuth (one rating for every target) ────────────────────────────── */

const SAP_AUTH_LIMITS: Readonly<Partial<Record<SapAuth, readonly string[]>>> = {
  OAUTH_SAML_BEARER: [
    "The assertion is built for SuccessFactors (saml-assertion.ts) and has not been proven against a live tenant (P0.9).",
  ],
  API_KEY: [
    "A header key works (api-key-header.ts) but cannot be combined with OAuth, which Ariba needs (connection-resolver.ts).",
  ],
};

function sapAuthCell(auth: SapAuth): CapabilityCell {
  const impl = SAP_AUTH_IMPLEMENTATION[auth];
  const implemented = impl !== null && (BROKER_FACTS.sapAuthTypes as readonly string[]).includes(impl);
  return cell(auth, "", {
    implemented,
    basis: [
      implemented
        ? `Connection auth type "${impl}" (connection-resolver.ts SapAuthType).`
        : auth === "PRINCIPAL_PROPAGATION"
          ? "Every call runs as the connection's one stored user; no end-user identity reaches SAP (connection-resolver.ts SapAuthType has no such type)."
          : `No ${auth === "X509_MTLS" ? "client-certificate" : auth} auth type (connection-resolver.ts SapAuthType: ${BROKER_FACTS.sapAuthTypes.join(", ")}).`,
    ],
    limits: SAP_AUTH_LIMITS[auth] ?? [],
    evidenceKey: `sapAuth:${auth}`,
    what: `${auth} toward SAP.`,
  });
}

/* ── consumerAuth ─────────────────────────────────────────────────────── */

const CONSUMER_STATIC_LIMITS: Readonly<Record<Consumer, readonly string[] | "unsupported">> = {
  JS_TS: [],
  PYTHON: ["No Python SDK or sample: the starter kit generates TypeScript only (scaffold.ts)."],
  JAVA: ["No Java SDK or sample: the starter kit generates TypeScript only (scaffold.ts)."],
  DOTNET: ["No .NET SDK or sample: the starter kit generates TypeScript only (scaffold.ts)."],
  ABAP_ONPREM: ["SM59 stores no static header, so the header is set in code; no ABAP sample."],
  ABAP_CLOUD: ["Whether a communication arrangement can store a static header is unconfirmed; no ABAP sample."],
  LOW_CODE: ["OpenAPI 3.1 and 3.0.3 import into low-code tools (e.g. Power Platform) is unverified."],
  AI_AGENT: ["No MCP server or tool schema: /api/mcp is a reserved prefix with no route."],
  HUMAN_TESTER: ["The Test Console reads only, at most 50 rows (broker-run route); otherwise a manual curl."],
  GO: ["No Go SDK or sample: the starter kit generates TypeScript only (scaffold.ts)."],
  PHP: ["No PHP SDK or sample: the starter kit generates TypeScript only (scaffold.ts)."],
  /*
   * A long-lived ce_ key compiled into a distributed app is a leaked key by
   * construction, and CoreEdge has no user-delegated login a mobile app
   * should use instead. Not a supported pattern, so none.
   */
  MOBILE: "unsupported",
  SAP_CAP: ["A CAP remote service can send the header through a BTP destination [E63]; no sample."],
  SAP_BUILD: ["SAP Build reaches it through a BTP destination with a header; no sample."],
};

function consumerAuthCell(facts: CodeFacts, consumer: Consumer, auth: ConsumerAuth): CapabilityCell {
  if (!(BROKER_FACTS.consumerAuth as readonly string[]).includes(auth)) {
    const why: Record<ConsumerAuth, string> = {
      STATIC_BEARER: "",
      OAUTH_CLIENT_CREDENTIALS: "No northbound token endpoint (P2.5): the broker accepts a static bearer key only (auth.ts).",
      MTLS: "No client-certificate handling on the northbound routes (auth.ts).",
      USER_DELEGATED_OIDC: "No user-delegated login on the northbound routes (auth.ts); console sign-in is a magic link or passkey.",
    };
    return cell(consumer, auth, { implemented: false, basis: [why[auth]] });
  }
  const limits = CONSUMER_STATIC_LIMITS[consumer];
  const kitHasTs = facts.starterKitFiles.includes("client.ts");
  if (limits === "unsupported") {
    return cell(consumer, auth, {
      implemented: false,
      basis: ["A long-lived ce_ key compiled into a distributed app is a leaked key; there is no user-delegated login for one to use instead."],
    });
  }
  return cell(consumer, auth, {
    implemented: true,
    basis: [
      "A ce_ bearer key, looked up by its SHA-256 hash (auth.ts, bearer.ts).",
      ...(consumer === "JS_TS" ? [kitHasTs ? "The starter kit writes a TypeScript client (scaffold.ts client.ts)." : "The starter kit no longer writes a TypeScript client."] : []),
    ],
    limits: consumer === "JS_TS" && !kitHasTs ? ["No TypeScript client in the starter kit."] : limits,
    evidenceKey: `consumerAuth:${consumer}|${auth}`,
    what: "Static bearer key.",
  });
}

/* ── lifecycle ────────────────────────────────────────────────────────── */

function lifecycleCells(facts: CodeFacts): CapabilityCell[] {
  const kit = facts.starterKitFiles;
  const kitHasCi = kit.some((f) => f.startsWith(".github/") || f.includes("workflow"));
  const kms = facts.keyProviders.filter((p) => p !== "env");
  const stages: Record<LifecycleStage, Judged> = {
    DISCOVER: {
      implemented: true,
      basis: [
        "Studio Discover and the Workbench catalogue (dynamic-catalog.ts); one address per row, and a V4 address is verified per system by a recorded 200 (hub-content.ts catalogueAddress, catalogue-address-verification.ts; P0.8).",
        "A connection's own Gateway catalogue is listed on the governed console pipeline and stored per connection, each service classed under SAP API Policy §1.2, customer-built apart (tenant-discovery.ts, tenant-listing.ts; P1.2).",
        "A service is registered from its description file as a DRAFT with its contract and no tenant call (contracts/upload.ts; P1.2); an S/4 Public service shows the SAP communication scenario that enables it, from SAP's own table (comm-scenarios.ts).",
      ],
      limits: [
        "The OData V4 service groups are not read on S/4HANA Cloud Public Edition, and a listing needs the communication user to be allowed to read the system's service catalogue.",
        "No live lab listing is recorded yet: the classifier is proved on a synthetic fixture until the lab recording replaces it (P1.8).",
      ],
    },
    DESIGN_MAP: {
      implemented: true,
      basis: ["An interface names API, entity set and operation; schema capture (schema-capture.ts)."],
      limits: ["No field mapping or flow design."],
    },
    MOCK_TEST_BEFORE_CODE: {
      implemented: kit.includes("mock.mjs"),
      basis: [
        "The starter kit ships a mock server and fixtures (scaffold.ts mock.mjs); the Test Console runs dry reads.",
        "Fixtures carry one scenario per broker outcome with the broker's own status, and are published only for the contract they were captured under (fixtures.ts, contract-provenance.ts; P0.4).",
      ],
      limits: ["No saved collections, assertions or write tests."],
    },
    DEVELOP_SDK_CODEGEN: {
      implemented: kit.includes("client.ts"),
      basis: [
        "The starter kit generates a TypeScript read client and OpenAPI 3.1 (scaffold.ts); CI compiles the client under strict (check-scaffold-client.ts; P0.4).",
        ...(kit.includes("openapi-3.0.json")
          ? [
              "The kit's OpenAPI 3.1 and 3.0.3 documents, and the solution's (GET /api/studio/solutions/[id]/openapi), describe every served operation, header and error code, with record and write-body schemas compiled from the service's own $metadata once it is verified (lib/contracts/openapi.ts, compile.ts; P1.3).",
            ]
          : []),
      ],
      limits: ["TypeScript only, reads only."],
    },
    CI_PRECOMMIT_GOVERNANCE: {
      implemented: kitHasCi,
      basis: [
        kitHasCi
          ? "The starter kit ships a CI workflow."
          : `The starter kit ships no CI workflow (scaffold.ts writes ${kit.join(", ")}), and Studio APIs accept browser sessions only.`,
      ],
      limits: ["No contract tests or policy gates."],
    },
    DEPLOY_PROMOTE_ENVIRONMENTS: {
      implemented: true,
      basis: ["Per-environment connections, grants and keys (SANDBOX, DEV, TEST, PROD)."],
      limits: ["Promotion is manual repetition; PROD is not gated on TEST (P3.4)."],
    },
    RUN_MONITOR_ALERT: {
      implemented: true,
      basis: [
        "Operations Center, Control Tower and incidents (ops/incidents.ts); a daily probe emails org admins (connection-probe-sweep.ts).",
        "A correlation-id search in Operations (correlation-lookup.ts), per-service verdicts and owners on the SAP system screen (service-health.ts), and a circuit breaker per SAP system on every governed call that observes until COREEDGE_CIRCUIT_BREAKER=enforce (governed/containment.ts; P0.14).",
      ],
      limits: ["No real-time alerts and no owner paging (P3.7)."],
    },
    GOVERN_AUDIT_COMPLY: {
      implemented: true,
      basis: [
        "Two-person approval, mandatory grant expiry checked per call, grants bound to one interface (grant-binding.ts), revoke, per-key rate limits, audit retention.",
        "One governed pipeline with named steps and one refusal table for the northbound read and write, the Test Console run and the Workbench preview (governed/pipeline.ts; P0.14).",
      ],
      limits: [
        `Holes still open by default: COREEDGE_GRANT_BINDING defaults to ${facts.grantBindingDefault}, COREEDGE_STEP_UP to ${BROKER_FACTS.stepUpDefault}, and a failed broker audit insert is logged and swallowed (audit.ts; P3.10).`,
      ],
    },
    SECRETS_KEYS: {
      implemented: true,
      basis: [
        "SAP secrets sealed under per-organisation data keys (secret-envelope.ts); consumer keys expire and rotate with an overlap (key-policy.ts).",
        "A re-saved SAP connection secret is sent to SAP once (sign-in and $metadata) before it replaces a working one: COREEDGE_ROTATION_PROBE=observe (default) reports what SAP answered, enforce refuses a secret SAP refused the sign-in for (rotation-probe.ts; P0.14).",
      ],
      limits:
        kms.length > 0
          ? []
          : [`The only key provider built in is "${facts.keyProviders.join(", ")}": the master key is an environment variable, no KMS (key-provider.ts; P0.10).`],
    },
    SAP_UPGRADE_IMPACT: {
      implemented: true,
      basis: [
        "The catalogue tracks deprecation and recorded successors (hub-successors.ts); SAP's lifecycle state, version and named successor are stamped on deploy from the committed Hub snapshot (hub-lifecycle-snapshot.ts; P0.8).",
        "A verify compiles the service's $metadata into a ContractSnapshot whose semantic version is a structural diff's verdict against the last one (removed or retyped is major, added optional is minor; lib/contracts/diff.ts, snapshot.ts; P1.3).",
      ],
      limits: [
        "Most deprecated APIs name no successor (the Hub's Successors field is behind its login), and no impact alert reaches interface owners (P3.8).",
      ],
    },
    SELF_HOST_SETUP: {
      implemented: true,
      basis: ["pnpm build and pnpm start run in CI."],
      limits: ["No container image, standalone output or self-host runbook (P4.5)."],
    },
    AI_ASSIST: {
      implemented: false,
      basis: ["No AI in CoreEdge: /api/mcp is a reserved prefix with no route, and the AI orchestrator serves only the portal."],
    },
    ONBOARDING_TIME_TO_FIRST_CALL: {
      implemented: true,
      basis: [
        "Developer workspace sign-up (P0.13, COREEDGE_DEVELOPER_SIGNUP).",
        "Time to first call and to first real call are measured, median and p90 against A.3 #1 and #2 (journey.ts, journey-metrics.ts; P2.12).",
      ],
      limits: ["No twin to call first; a real first call waits for a second person's approval and SAP set-up."],
    },
    PROVIDER_BUILD_TRANSPORT: {
      implemented: facts.servicePathOrigins.includes("CUSTOMER_CUSTOM"),
      basis: ["A Z* or YY1_* service is registered by path and verified from $metadata per environment (service-verifications.ts; P1.1)."],
      limits: ["Building the service and transporting it stay in SAP; nothing re-verifies or gates it on promotion (P3.4)."],
    },
    API_VERSIONING:
      facts.northboundApiVersions.length > 0
        ? {
            implemented: true,
            basis: [
              `Dated northbound versions (${facts.northboundApiVersions.join(", ")}): every response names its version in CoreEdge-Version, a request may pin one, an unknown or retired one is a 400 UNSUPPORTED_VERSION, and an unpinned request is served the oldest supported version (version-policy.ts, versioned-route.ts; P1.10).`,
              "Served at /api/northbound/v1/* and the original /api/northbound/* by the same handlers; Deprecation (RFC 9745) and Sunset (RFC 8594) headers, a 6-month overlap the registry is checked against in CI, and a changelog (GET /api/northbound/versions, docs/coreedge/api-changelog.md).",
              "The starter kit and the ABAP lab-guide samples are replayed on both paths and every supported version in CI (northbound-consumer-replay.test.ts). A deprecation's announcement date is checked in review (roadmap P1.10, open decision).",
            ],
            evidenceKey: "lifecycle:API_VERSIONING",
            what: "Dated northbound versions with deprecation headers and a changelog.",
          }
        : {
            implemented: false,
            basis: [
              "No dated northbound version that keeps the deprecation policy is registered (version-policy.ts NORTHBOUND_API_VERSIONS, checkRegistry; P1.10).",
            ],
          },
    PERFORMANCE_TEST: {
      implemented: false,
      basis: ["No load test of the broker: tests/performance holds synthetic portal benchmarks, and no twin exists to load (A.3 #14)."],
    },
    SUPPORT_INCIDENT: {
      implemented: true,
      basis: ["Incidents (ops/incidents.ts) and the daily probe email to org admins."],
      limits: ["Nobody is paged, there is no status page and no consumer ticket intake."],
    },
    RETIRE: {
      implemented: true,
      basis: [
        "Revoking a key ends the current and the previous key; dropped keys are kept as RetiredClientToken; a RETIRED solution is refused at runtime (auth.ts); audit retention (retention.ts).",
      ],
      limits: ["No evidence archive at retirement and no clean-up of fixtures or twin data."],
    },
  };
  return LIFECYCLE_STAGES.map((stage) => cell(stage, "", stages[stage]));
}

/* ── the registry ─────────────────────────────────────────────────────── */

export interface PlatformCells {
  readonly targetTech: readonly CapabilityCell[];
  readonly techPattern: readonly CapabilityCell[];
  readonly network: readonly CapabilityCell[];
  readonly origin: readonly CapabilityCell[];
  readonly sapAuth: readonly CapabilityCell[];
  readonly consumerAuth: readonly CapabilityCell[];
  readonly lifecycle: readonly CapabilityCell[];
}

export interface CapabilityRegistry {
  readonly generatedBy: string;
  readonly method: string;
  readonly headlineHosting: Hosting;
  readonly facts: CodeFacts;
  /** The core model's cells, with the network scored for the headline hosting mode. */
  readonly coreedgeToday: PlatformCells;
  /** Network reach per hosting mode (caveat 8d). */
  readonly networkByHosting: Readonly<Record<Hosting, readonly CapabilityCell[]>>;
  /** Cells for the caveat 8 dimension values, scored only in the extended model. */
  readonly extended: Pick<PlatformCells, "targetTech" | "techPattern" | "consumerAuth">;
}

const METHOD =
  "Each cell is scored from the code: none when the capability is not implemented; partial when it is, with a material limit or without recorded evidence; full when it is implemented with no limit and tests and a document exist (roadmap section 2.3). See src/lib/coreedge/capability-registry.ts.";

export function buildCapabilityRegistry(facts: CodeFacts = readCodeFacts()): CapabilityRegistry {
  const coreTargets: readonly Target[] = TARGETS;
  const allTargets: readonly Target[] = [...TARGETS, ...EXTENDED_TARGETS];
  const coreTechs: readonly Tech[] = TECHS;
  const coreConsumers: readonly Consumer[] = CONSUMERS;

  const networkByHosting = Object.fromEntries(
    HOSTINGS.map((h) => [h, NETWORKS.map((n) => networkCell(facts, h, n))]),
  ) as Record<Hosting, CapabilityCell[]>;

  return {
    generatedBy: "src/lib/coreedge/capability-registry.ts (pnpm coreedge:registry)",
    method: METHOD,
    headlineHosting: HEADLINE_HOSTING,
    facts,
    coreedgeToday: {
      targetTech: coreTargets.flatMap((t) => coreTechs.map((tech) => targetTechCell(facts, t, tech))),
      techPattern: coreTechs.flatMap((tech) => PATTERNS.map((p) => techPatternCell(facts, tech, p))),
      network: networkByHosting[HEADLINE_HOSTING],
      origin: originCells(facts),
      sapAuth: SAP_AUTHS.map((a) => sapAuthCell(a)),
      consumerAuth: coreConsumers.flatMap((c) => CONSUMER_AUTHS.map((a) => consumerAuthCell(facts, c, a))),
      lifecycle: lifecycleCells(facts),
    },
    networkByHosting,
    extended: {
      // Every target against the new technologies, and the new targets against the old ones.
      targetTech: [
        ...EXTENDED_TARGETS.flatMap((t) => coreTechs.map((tech) => targetTechCell(facts, t, tech))),
        ...allTargets.flatMap((t) => EXTENDED_TECHS.map((tech) => targetTechCell(facts, t, tech))),
      ],
      techPattern: EXTENDED_TECHS.flatMap((tech) => PATTERNS.map((p) => techPatternCell(facts, tech, p))),
      consumerAuth: EXTENDED_CONSUMERS.flatMap((c) => CONSUMER_AUTHS.map((a) => consumerAuthCell(facts, c, a))),
    },
  };
}

/** The registry as the committed JSON holds it: stable key order, two-space indent, trailing newline. */
export function serializeCapabilityRegistry(registry: CapabilityRegistry = buildCapabilityRegistry()): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}
