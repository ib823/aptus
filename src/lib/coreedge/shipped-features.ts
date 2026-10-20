/**
 * The features the capability registry marks shipped, as documents name them
 * (roadmap P0.16).
 *
 * WHY. The documents drifted from the code: the security architecture called
 * the northbound broker, the per-call audit and write idempotency "planned"
 * long after they shipped; the build-spec archive said "all BUILT"; a header
 * comment said nothing was callable at runtime. Each was true once. Nothing
 * failed when the code moved on, so nothing told the reader.
 *
 * WHAT THIS IS. One row per feature a reader looks for in a document, with
 *   - the registry cells it is part of (`cells`). The feature counts as
 *     shipped only while the registry scores every one of them above none, so
 *     a feature the code stops doing stops being protected the same moment;
 *   - the code that implements it (`code`): a module and the exports that do
 *     the work. scripts/coreedge/check-doc-claims.ts refuses to run when one
 *     is gone, so a row cannot outlive its code;
 *   - the words a document uses for it (`terms`).
 *
 * `scripts/coreedge/check-doc-claims.ts` (`pnpm coreedge:doc-claims`, in CI)
 * then refuses any sentence or table row in the CoreEdge documents that puts
 * one of these terms next to "planned", "not yet built", "coming soon" and the
 * like (src/lib/coreedge/doc-claims.ts). See
 * docs/runbooks/coreedge-doc-claims.md.
 *
 * WHAT IT IS NOT. A second registry. It scores nothing: the status comes from
 * buildCapabilityRegistry(). A feature that is shipped with a lenient default
 * (step-up warns, grant binding is legacy, sign-up is off) is still shipped:
 * a document must say what the default is, not that the feature is planned.
 *
 * PURE. Imported by a tsx script and by tests, never by a route.
 */

import {
  buildCapabilityRegistry,
  type CapabilityCell,
  type CapabilityRegistry,
  type PlatformCells,
} from "./capability-registry";

export interface FeatureCode {
  /** Repository-relative path of the module that implements the feature. */
  readonly file: string;
  /** Exports of that module that do the work; each must still be exported. */
  readonly exports: readonly string[];
}

export interface DocumentedFeature {
  readonly id: string;
  readonly name: string;
  /** The roadmap item that delivered it, where one did. */
  readonly roadmap?: string;
  /**
   * Registry cells, as `<group>:<row>` or `<group>:<row>|<col>`, where group is
   * a key of the registry's `coreedgeToday` (targetTech, techPattern, network,
   * origin, sapAuth, consumerAuth, lifecycle).
   */
  readonly cells: readonly string[];
  readonly code: FeatureCode;
  /** Case-insensitive patterns that name the feature in prose. */
  readonly terms: readonly RegExp[];
}

const GOVERN = "lifecycle:GOVERN_AUDIT_COMPLY";
const SECRETS = "lifecycle:SECRETS_KEYS";
const READ = "techPattern:ODATA_V2|SYNC_READ";
const CREATE = "techPattern:ODATA_V2|SYNC_CREATE";

export const DOCUMENTED_FEATURES: readonly DocumentedFeature[] = [
  {
    id: "northbound-broker",
    name: "The northbound API and broker",
    cells: [READ],
    code: { file: "src/lib/northbound/read.ts", exports: ["readEntitySet"] },
    terms: [
      /\bnorthbound (?:api|broker|routes?|endpoints?)\b/i,
      /\bbroker\b/i,
      /\/api\/northbound\b/i,
      /\bgoverned entry point\b/i,
      /\bcallable at runtime\b/i,
    ],
  },
  {
    id: "runtime-credentials",
    name: "Per-solution runtime credentials (hashed bearer keys)",
    cells: ["consumerAuth:JS_TS|STATIC_BEARER"],
    code: { file: "src/lib/northbound/auth.ts", exports: ["authenticateClientToken", "hashClientToken"] },
    // Not "client credentials": that is the OAuth grant, which is not built (P2.5).
    terms: [
      /\bper-solution (?:identity|identities|tokens?|credentials?|keys?)\b/i,
      /\bSolutionClient\b/,
      /\bruntime (?:credentials?|keys?)\b/i,
    ],
  },
  {
    id: "write-path",
    name: "Governed writes (create) with a separate write key",
    cells: [CREATE],
    code: { file: "src/lib/northbound/write.ts", exports: ["writeEntitySet"] },
    terms: [
      /\bwrite (?:keys?|credentials?)\b/i,
      /\bX-CoreEdge-Write-Key\b/i,
      /\bnorthbound writes?\b/i,
      /\bwrite path\b/i,
    ],
  },
  {
    id: "write-idempotency",
    name: "Write idempotency (Idempotency-Key)",
    cells: [CREATE],
    code: { file: "src/lib/northbound/idempotency.ts", exports: ["reserveIdempotencyKey", "completeIdempotencyKey"] },
    terms: [/\bidempoten(?:cy|t)\b/i, /\bduplicate[- ]prevention\b/i],
  },
  {
    id: "csrf-writes",
    name: "CSRF fetch-then-use on writes",
    cells: [CREATE],
    code: { file: "src/lib/northbound/write.ts", exports: ["writeEntitySet"] },
    terms: [/\bCSRF\b/],
  },
  {
    id: "access-grants",
    name: "Access grants, the two-person rule and grant expiry",
    cells: [GOVERN],
    code: { file: "src/lib/studio/grants.ts", exports: ["evaluateDecision", "grantsRead", "grantsWrite"] },
    terms: [
      /\bApiAccessGrant\b/,
      /\baccess grants?\b/i,
      /\btwo-person\b/i,
      /\b(?:separation|segregation) of duties\b/i,
      /\bapproval gates?\b/i,
      /\btenant-bound scopes?\b/i,
    ],
  },
  {
    id: "grant-binding",
    name: "Grants bound to one interface and SAP product",
    roadmap: "P0.1",
    cells: [GOVERN],
    code: { file: "src/lib/studio/grant-binding.ts", exports: ["grantBindingMode"] },
    terms: [
      /\bgrant binding\b/i,
      /\bgrants? (?:are |is )?bound to (?:one|an|its|a single) interface\b/i,
      /\bCOREEDGE_GRANT_BINDING\b/,
    ],
  },
  {
    id: "owner-liveness",
    name: "Owner liveness (departed owners stop counting)",
    roadmap: "P0.1",
    cells: [GOVERN],
    code: { file: "src/lib/studio/owner-liveness.ts", exports: ["sweepOwnerLiveness", "liveOwnership"] },
    terms: [/\bowner liveness\b/i, /\bdeparted owners?\b/i],
  },
  {
    id: "step-up",
    name: "Passkey step-up on governance actions",
    roadmap: "P0.12",
    cells: [GOVERN],
    code: { file: "src/lib/auth/step-up.ts", exports: ["requireStepUp", "stepUpMode"] },
    terms: [/\bstep-up\b/i, /\bCOREEDGE_STEP_UP\b/, /\bMFA on governance\b/i],
  },
  {
    id: "call-audit",
    name: "The per-call audit (NorthboundAuditEvent)",
    cells: [GOVERN],
    code: { file: "src/lib/northbound/audit.ts", exports: ["recordNorthboundCall"] },
    terms: [/\bper-call audit\b/i, /\baudit store\b/i, /\bNorthboundAuditEvent\b/, /\bcall audit\b/i],
  },
  {
    id: "config-audit",
    name: "The configuration-change audit (ConfigAudit)",
    cells: [GOVERN],
    code: { file: "src/lib/studio/audit.ts", exports: ["writeConfigAudit"] },
    terms: [/\bConfigAudit\b/, /\bconfig(?:uration)?-change audit\b/i],
  },
  {
    id: "write-back-audit",
    name: "The Workbench write-back audit (PlatformAuditEvent)",
    roadmap: "P0.7",
    cells: [GOVERN],
    code: { file: "src/lib/audit/platform-audit.ts", exports: ["beginPlatformAudit", "completePlatformAudit"] },
    terms: [/\bwrite-back audit\b/i, /\bPlatformAuditEvent\b/],
  },
  {
    id: "tenant-guard",
    name: "The tenant-scope guard",
    roadmap: "P0.12",
    cells: [GOVERN],
    code: { file: "src/lib/db/tenant-guard.ts", exports: ["tenantGuardMode", "isUnscopedByDesign"] },
    terms: [/\btenant[- ]isolation\b/i, /\btenant[- ]scope guard\b/i, /\btenant guard\b/i, /\bTENANT_SCOPE_GUARD\b/],
  },
  {
    id: "rate-limits",
    name: "Rate limits, per credential on machine routes",
    roadmap: "P0.5",
    cells: [GOVERN],
    code: { file: "src/lib/security/rate-limit.ts", exports: ["MACHINE_API_PREFIXES", "checkRateLimit"] },
    terms: [/\brate[- ]limit(?:s|ing|ed|er)?\b/i, /\bper-(?:credential|key) limits?\b/i, /\bLIMITER_UNAVAILABLE\b/],
  },
  {
    id: "secret-sealing",
    name: "SAP secrets sealed at rest (AES-256-GCM, bound to their row)",
    cells: [SECRETS],
    code: { file: "src/lib/sap-public/connection-crypto.ts", exports: ["sealSecrets", "openSecrets", "connectionAad"] },
    terms: [
      /\b(?:secret|credential) sealing\b/i,
      /\bsecretsCiphertext\b/,
      /\bsealed (?:at rest|secrets?)\b/i,
      /\bAES-256-GCM\b/i,
      /\bkeystone\b/i,
    ],
  },
  {
    id: "envelope-keys",
    name: "Envelope encryption with versioned, rotatable master keys",
    roadmap: "P0.10",
    cells: [SECRETS],
    code: { file: "src/lib/sap-public/secret-envelope.ts", exports: ["sealSecretsForOrg", "openSecretsForOrg"] },
    terms: [
      /\benvelope (?:encryption|keys?)\b/i,
      /\bper-organi[sz]ation data keys?\b/i,
      /\bOrgDataKey\b/,
      /\bversioned (?:master )?keys?\b/i,
      /\bkey versioning\b/i,
      /\breseal\b/i,
    ],
  },
  {
    id: "key-expiry",
    name: "Mandatory expiry for TEST and PROD runtime keys",
    roadmap: "P0.11",
    cells: [SECRETS],
    code: { file: "src/lib/northbound/key-policy.ts", exports: ["requiresExpiry", "keyExpiryMode"] },
    terms: [
      /\bkey expiry\b/i,
      /\b(?:runtime )?keys (?:now )?expire\b/i,
      /\bCOREEDGE_KEY_EXPIRY\b/,
      /\bexpiring (?:runtime )?keys?\b/i,
    ],
  },
  {
    id: "rotation-overlap",
    name: "Key rotation with an overlap window",
    roadmap: "P0.11",
    cells: [SECRETS],
    code: { file: "src/lib/northbound/key-policy.ts", exports: ["rotationOverlapHours", "overlapIsOpen"] },
    terms: [/\brotation overlap\b/i, /\boverlap window\b/i, /\bCOREEDGE_KEY_ROTATION_OVERLAP_HOURS\b/],
  },
  {
    id: "key-prefixes",
    name: "ce_live_ and ce_test_ key prefixes",
    roadmap: "P0.11",
    cells: [SECRETS],
    code: { file: "src/lib/northbound/key-policy.ts", exports: ["LIVE_TOKEN_PREFIX", "TEST_TOKEN_PREFIX"] },
    terms: [/\bce_live_/, /\bce_test_/, /\btest and live (?:key )?prefixes\b/i],
  },
  {
    id: "developer-signup",
    name: "Developer workspace sign-up",
    roadmap: "P0.13",
    cells: ["lifecycle:ONBOARDING_TIME_TO_FIRST_CALL"],
    code: { file: "src/lib/auth/developer-signup-mode.ts", exports: ["developerSignupMode"] },
    terms: [
      /\bdeveloper (?:workspace )?sign-?up\b/i,
      /\bself-service (?:developer )?(?:onboarding|sign-?up)\b/i,
      /\bCOREEDGE_DEVELOPER_SIGNUP\b/,
      /\bsandbox_developer\b/,
    ],
  },
  {
    id: "bootstrap-token",
    name: "The first platform admin claimed with a bootstrap token",
    roadmap: "P0.13",
    cells: ["lifecycle:ONBOARDING_TIME_TO_FIRST_CALL"],
    code: { file: "src/lib/auth/bootstrap.ts", exports: ["claimPlatformAdmin", "checkBootstrapToken"] },
    terms: [/\bbootstrap token\b/i, /\bCOREEDGE_BOOTSTRAP_TOKEN\b/],
  },
  {
    id: "custom-services",
    name: "Customer-built services registered by service path (Z*, YY1_*)",
    roadmap: "P1.1",
    cells: ["origin:CUSTOMER_CUSTOM"],
    code: { file: "src/lib/sap-public/service-path.ts", exports: ["validateServicePath"] },
    terms: [
      /\bcustom(?:er)?[- ]built (?:APIs?|services?|interfaces?)\b/i,
      /\bcustom service paths?\b/i,
      /\bcustom \(?`?Z\*?`?\)? interfaces?\b/i,
      /\bZ\*/,
      /\bYY1_/,
      /\bregister(?:ed|ing)? (?:it )?by (?:its |their )?(?:service )?path\b/i,
      /\bservices? outside SAP's (?:published )?catalogue\b/i,
    ],
  },
  {
    id: "saml-bearer",
    name: "OAuth SAML bearer toward SAP (SuccessFactors)",
    cells: ["sapAuth:OAUTH_SAML_BEARER"],
    code: { file: "src/lib/sap-public/saml-assertion.ts", exports: ["buildSignedSamlAssertionXml"] },
    terms: [/\bSAML bearer\b/i, /\bsaml-bearer\b/i, /\bbearer assertion\b/i],
  },
  {
    id: "sap-client",
    name: "SAP-client addressing",
    cells: ["targetTech:S4_ONPREM|ODATA_V2"],
    code: { file: "src/lib/sap-public/sap-url.ts", exports: ["buildSapUrl", "isValidSapClient"] },
    terms: [/\bsap-client\b/i, /\bclient addressing\b/i],
  },
  {
    id: "starter-kit",
    name: "The starter kit and its offline mock",
    cells: ["lifecycle:MOCK_TEST_BEFORE_CODE", "lifecycle:DEVELOP_SDK_CODEGEN"],
    code: { file: "src/lib/studio/scaffold.ts", exports: ["buildScaffold"] },
    terms: [/\bstarter[- ]kit\b/i, /\boffline mock\b/i],
  },
  {
    id: "contract-stamps",
    name: "Captures stamped with the contract they were read under",
    roadmap: "P0.4",
    cells: ["lifecycle:MOCK_TEST_BEFORE_CODE"],
    code: { file: "src/lib/studio/contract-provenance.ts", exports: ["artifactState", "partitionFixtures"] },
    terms: [/\bcontract stamps?\b/i, /\bcontract[- ]stamped\b/i, /\bcontracts:stamp\b/],
  },
  {
    id: "catalogue-addresses",
    name: "One catalogue address per row, V4 addresses verified per system",
    roadmap: "P0.8",
    cells: ["lifecycle:DISCOVER"],
    code: {
      file: "src/lib/sap-public/catalogue-address-verification.ts",
      exports: ["recordAddressProbe", "currentAddressVerification"],
    },
    terms: [/\bCatalogueAddressVerification\b/, /\b(?:catalogue )?address verification\b/i],
  },
  {
    id: "hub-lifecycle-stamp",
    name: "SAP's API lifecycle stamped on deploy from the committed Hub snapshot",
    roadmap: "P0.8",
    cells: ["lifecycle:SAP_UPGRADE_IMPACT"],
    code: { file: "src/lib/sap-public/hub-lifecycle-snapshot.ts", exports: ["applyHubLifecycle", "hubLifecycleOnDeploy"] },
    terms: [/\bHUB_LIFECYCLE_ON_DEPLOY\b/, /\bapply-hub-lifecycle\b/, /\blifecycle stamp\b/i],
  },
  {
    id: "journey-metrics",
    name: "Time to first call measured (developer journey events)",
    roadmap: "P2.12",
    cells: ["lifecycle:ONBOARDING_TIME_TO_FIRST_CALL"],
    code: { file: "src/lib/coreedge/journey.ts", exports: ["recordJourneyEvent", "loadJourneySummary"] },
    terms: [
      /\bDeveloperJourneyEvent\b/,
      /\bCOREEDGE_JOURNEY_EVENTS\b/,
      /\bjourney (?:events?|tiles?)\b/i,
      /\b(?:TTFC|TTFRC) (?:tiles?|funnel|metrics?)\b/,
    ],
  },
];

/* ── status, from the registry ────────────────────────────────────────── */

type CellGroup = keyof PlatformCells;
const GROUPS: readonly CellGroup[] = [
  "targetTech",
  "techPattern",
  "network",
  "origin",
  "sapAuth",
  "consumerAuth",
  "lifecycle",
];

export class UnknownRegistryCellError extends Error {
  constructor(featureId: string, cell: string) {
    super(`Feature "${featureId}" names registry cell "${cell}", which the capability registry does not have.`);
    this.name = "UnknownRegistryCellError";
  }
}

/** The registry cell a `<group>:<row>|<col>` key names, or undefined. */
export function registryCell(registry: CapabilityRegistry, key: string): CapabilityCell | undefined {
  const sep = key.indexOf(":");
  if (sep < 0) return undefined;
  const group = key.slice(0, sep) as CellGroup;
  if (!GROUPS.includes(group)) return undefined;
  const [row, col = ""] = key.slice(sep + 1).split("|");
  return registry.coreedgeToday[group].find((c) => c.row === row && c.col === col);
}

export interface FeatureStatus {
  readonly feature: DocumentedFeature;
  readonly shipped: boolean;
  /** Each named cell with the status the registry gives it. */
  readonly cells: readonly { readonly key: string; readonly status: CapabilityCell["status"] }[];
}

/** Every documented feature with whether the registry marks it shipped (no named cell at none). */
export function featureStatuses(
  registry: CapabilityRegistry = buildCapabilityRegistry(),
  features: readonly DocumentedFeature[] = DOCUMENTED_FEATURES,
): FeatureStatus[] {
  return features.map((feature) => {
    const cells = feature.cells.map((key) => {
      const cell = registryCell(registry, key);
      if (!cell) throw new UnknownRegistryCellError(feature.id, key);
      return { key, status: cell.status };
    });
    return { feature, shipped: cells.length > 0 && cells.every((c) => c.status !== "none"), cells };
  });
}

/** The features a document may not call planned. */
export function shippedFeatures(
  registry: CapabilityRegistry = buildCapabilityRegistry(),
  features: readonly DocumentedFeature[] = DOCUMENTED_FEATURES,
): DocumentedFeature[] {
  return featureStatuses(registry, features)
    .filter((s) => s.shipped)
    .map((s) => s.feature);
}

/** The exports a feature names that its module no longer has. `source` is the module's text. */
export function missingExports(code: FeatureCode, source: string): string[] {
  return code.exports.filter(
    (name) =>
      !new RegExp(
        `^export\\s+(?:async\\s+)?(?:function\\*?|const|let|class|type|interface|enum)\\s+${name}\\b`,
        "m",
      ).test(source),
  );
}
