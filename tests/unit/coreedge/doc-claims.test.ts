// @vitest-environment node
/**
 * The documents match the code (roadmap P0.16).
 *
 *   1. The repository passes the document lint: no CoreEdge document, and no
 *      comment in the CoreEdge code, puts a feature the capability registry
 *      marks shipped next to "planned", "not yet built" or the like. This is
 *      the check `pnpm coreedge:doc-claims` runs in CI, run inside `pnpm test`.
 *   2. Every documented feature still has its code and its registry cells.
 *   3. The matcher catches the stale claims P0.16 corrected, in each format,
 *      and leaves alone the sentences that are right.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCapabilityRegistry, readCodeFacts } from "@/lib/coreedge/capability-registry";
import { checkDocument, proseUnits, sentences, staleClaimsIn, type ProseUnit } from "@/lib/coreedge/doc-claims";
import { docClaimsFiles, scanDocuments } from "@/lib/coreedge/doc-claims-scope";
import {
  DOCUMENTED_FEATURES,
  featureStatuses,
  missingExports,
  registryCell,
  shippedFeatures,
  UnknownRegistryCellError,
} from "@/lib/coreedge/shipped-features";

const ROOT = process.cwd();
const IDS = new Set(DOCUMENTED_FEATURES.map((f) => f.id));
const SHIPPED = shippedFeatures();

const claimsIn = (file: string, text: string) => checkDocument(file, text, SHIPPED, IDS);
const featureIdsIn = (file: string, text: string) =>
  [...new Set(claimsIn(file, text).claims.map((c) => c.featureId))].sort();
const unit = (text: string, allowed: string[] = []): ProseUnit => ({ line: 1, text, allowed });

describe("the repository", () => {
  it("has no not-built wording next to a shipped feature (run `pnpm coreedge:doc-claims` for the list)", () => {
    const result = scanDocuments(ROOT, docClaimsFiles(ROOT), SHIPPED, IDS);
    expect(result.problems).toEqual([]);
    expect(result.claims.map((c) => `${c.file}:${c.line} ${c.featureId} "${c.wording}": ${c.text}`)).toEqual([]);
  });

  it("reads the documents P0.16 corrected", () => {
    const files = docClaimsFiles(ROOT);
    for (const f of [
      "docs/coreedge/README.md",
      "docs/coreedge/CoreEdge-Security-Architecture.html",
      "docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md",
      "docs/coreedge-sap-target-expansion-spec.md",
      "docs/coreedge-developer-guide.md",
      "src/components/studio/DiscoverClient.tsx",
    ]) {
      expect(files, f).toContain(f);
    }
    // Its own vocabulary is not prose.
    expect(files).not.toContain("src/lib/coreedge/doc-claims.ts");
  });

  it("reads the Control Tower and Ops API routes, the middleware, and each shipped feature's own module", () => {
    const files = docClaimsFiles(ROOT);
    for (const f of [
      "src/app/api/control-tower/grants/route.ts",
      "src/app/api/ops/incidents/route.ts",
      "src/middleware.ts",
    ]) {
      expect(files, f).toContain(f);
    }
    for (const feature of DOCUMENTED_FEATURES) expect(files, feature.id).toContain(feature.code.file);
  });

  it("the gap study's executive summary agrees with its Status lines", () => {
    const study = readFileSync(path.join(ROOT, "docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md"), "utf8");
    const summary = study.slice(
      study.indexOf("## 1. Executive summary"),
      study.indexOf("## 2. How the gap was measured"),
    );
    expect(summary.length).toBeGreaterThan(1000);
    // P0.7: the write-back audits before SAP is called.
    expect(readFileSync(path.join(ROOT, "src/app/api/sap/tdd/write/route.ts"), "utf8")).toMatch(/beginPlatformAudit/);
    expect(summary).not.toMatch(/write-back writes no audit row/i);
    // #307 is merged and deployed (the header says so); only its live verification is owed.
    expect(summary).not.toMatch(/\*\*Merge and deploy `custom-service-path`/);
    // P0.10, P0.12 and P0.7 shipped: what remains before a real credential is switching them on.
    expect(summary).not.toMatch(/KMS envelope encryption \(P0\.10\);\s*\n\s*- MFA step-up/);
    // P0.1 fixed A46, A47 and A69 (Appendix D).
    expect(summary).not.toMatch(/\*\*Close the governance holes:\*\* grants not bound to an interface \(A47\)/);
  });

  it("skips only files that tell a reader they are historical", () => {
    const result = scanDocuments(ROOT, docClaimsFiles(ROOT), SHIPPED, IDS);
    expect(result.historical).toEqual(
      expect.arrayContaining(["docs/coreedge/CCC-Developer-Runtime-Build-Bible-Phase-D-v2.md"]),
    );
    expect(result.historical).not.toContain("docs/coreedge/CoreEdge-Security-Architecture.html");
  });
});

describe("the documented features", () => {
  it("each still has its module and the exports it names", () => {
    for (const f of DOCUMENTED_FEATURES) {
      const file = path.join(ROOT, f.code.file);
      expect(existsSync(file), `${f.id}: ${f.code.file}`).toBe(true);
      expect(missingExports(f.code, readFileSync(file, "utf8")), f.id).toEqual([]);
    }
  });

  it("each names registry cells that exist, and ids are unique", () => {
    const registry = buildCapabilityRegistry();
    for (const f of DOCUMENTED_FEATURES) {
      expect(f.cells.length, f.id).toBeGreaterThan(0);
      for (const key of f.cells) expect(registryCell(registry, key), `${f.id}: ${key}`).toBeDefined();
    }
    expect(IDS.size).toBe(DOCUMENTED_FEATURES.length);
  });

  it("are every one shipped today (a feature the code stops doing drops out of the lint: review its documents)", () => {
    const notShipped = featureStatuses()
      .filter((s) => !s.shipped)
      .map((s) => s.feature.id);
    expect(notShipped).toEqual([]);
  });

  it("take their status from the registry: a cell at none stops the feature being protected", () => {
    const registry = buildCapabilityRegistry({ ...readCodeFacts(), servicePathOrigins: [] });
    const status = featureStatuses(registry).find((s) => s.feature.id === "custom-services");
    expect(status?.cells).toEqual([{ key: "origin:CUSTOMER_CUSTOM", status: "none" }]);
    expect(status?.shipped).toBe(false);
    const row = "| Custom (`Z`) interfaces | n/a | Not callable yet | P1.1 |";
    expect(checkDocument("a.md", row, shippedFeatures(registry), IDS).claims).toEqual([]);
    expect(featureIdsIn("a.md", row)).toEqual(["custom-services"]);
  });

  it("refuse a cell the registry does not have", () => {
    expect(() =>
      featureStatuses(buildCapabilityRegistry(), [
        { id: "x", name: "x", cells: ["lifecycle:NO_SUCH_STAGE"], code: { file: "x", exports: [] }, terms: [/x/] },
      ]),
    ).toThrow(UnknownRegistryCellError);
  });

  it("missingExports reads export declarations, not mentions", () => {
    const source = "export async function realOne() {}\nexport const ALSO = 1;\n// fakeOne is mentioned here\n";
    expect(missingExports({ file: "m.ts", exports: ["realOne", "ALSO", "fakeOne"] }, source)).toEqual(["fakeOne"]);
  });
});

describe("the stale claims P0.16 corrected are caught", () => {
  it("the security architecture's planned spine (HTML list item, table row, summary)", () => {
    const html = [
      '<ul><li><b>Northbound broker</b> — OAuth2 client-credentials, per-solution identity, tenant-bound scopes, quotas <span class="tag t-gap">planned</span></li></ul>',
      '<table><tr><td>Write idempotency</td><td><span class="tag t-gap">planned</span></td><td>Idempotency keys</td></tr></table>',
      '<div class="callout navy"><b>Reviewer\'s summary.</b> The CoreEdge-specific spine — the northbound API broker, tenant-isolation enforcement, and the per-call audit store — is designed but not yet built.</div>',
      "<p>SAP credential sealing <span>keystone</span> (built, pending merge)</p>",
    ].join("\n");
    expect(featureIdsIn("sec.html", html)).toEqual(
      [
        "access-grants",
        "call-audit",
        "northbound-broker",
        "runtime-credentials",
        "secret-sealing",
        "tenant-guard",
        "write-idempotency",
      ].sort(),
    );
  });

  it("the gap study's customer-built rows (markdown table rows)", () => {
    const md = [
      "| Capability | Integration Suite | Best of breed | CoreEdge today | Target |",
      "|---|---|---|---|---|",
      "| Custom (`Z`) interfaces | Cloud ALM | n/a | Not callable yet | P1.1 then P3.7: CoreEdge becomes the monitoring layer for customer-built APIs |",
      "| In-flight work | Until #307 merges, customer-built `Z*`/`YY1_*` services are **not in production**. |",
    ].join("\n");
    const result = claimsIn("gap.md", md);
    expect(result.claims.map((c) => [c.line, c.featureId])).toEqual([
      [3, "custom-services"],
      [4, "custom-services"],
    ]);
  });

  it("DiscoverClient's header comment (a code block comment)", () => {
    const tsx = [
      '"use client";',
      "",
      "/**",
      " * Discover — the capability explorer, in Studio.",
      " *",
      ' * "Add to interface" creates a DRAFT and nothing more. It grants no access —',
      " * access is decided separately through an ApiAccessGrant, and nothing is callable",
      " * at runtime in v1 at all.",
      " */",
      'const label = "nothing is callable at runtime (a string, not prose)";',
    ].join("\n");
    const result = claimsIn("DiscoverClient.tsx", tsx);
    expect(result.claims.map((c) => c.featureId).sort()).toEqual(["access-grants", "northbound-broker"]);
    expect(result.claims.every((c) => c.line === 6)).toBe(true);
  });

  it("wave 1a and Phase 0a features called planned in prose", () => {
    const md = [
      "Passkey step-up on approvals is coming soon.",
      "",
      "- Developer workspace sign-up is not yet built.",
      "- Key expiry is planned for a future release.",
      "",
      "// a line comment: grant binding still to be built",
    ].join("\n");
    expect(featureIdsIn("a.md", md)).toEqual(["developer-signup", "grant-binding", "key-expiry", "step-up"]);
    const code = "// Envelope encryption is planned (P0.10).\nconst x = 1;\n";
    expect(featureIdsIn("a.ts", code)).toEqual(["envelope-keys"]);
  });
});

describe("sentences that are right are left alone", () => {
  it("a shipped feature and a planned one in different sentences", () => {
    expect(
      featureIdsIn("a.md", "The broker accepts static keys today. OAuth 2.0 client credentials are planned (P2.5)."),
    ).toEqual([]);
  });

  it("wording far from the feature term", () => {
    const text =
      "Rate limits apply per credential and per address on every machine route that exists in production today, and separately the consumer OAuth endpoint is planned.";
    expect(staleClaimsIn(unit(text), SHIPPED)).toEqual([]);
  });

  it("a planned rotation, a lenient default, and a feature that is not shipped", () => {
    expect(featureIdsIn("a.md", "The rotation overlap means a planned rotation causes no outage.")).toEqual([]);
    expect(featureIdsIn("a.md", "Step-up is not enforced by default: COREEDGE_STEP_UP defaults to warn.")).toEqual([]);
    expect(featureIdsIn("a.md", "A cloud KMS key provider is planned.")).toEqual([]);
  });

  it("wording quoted as a word, not used", () => {
    expect(featureIdsIn("a.md", 'The page marked the broker "planned" after it shipped.')).toEqual([]);
    expect(featureIdsIn("a.md", "The page marked the broker planned after it shipped.")).toEqual(["northbound-broker"]);
  });

  it("but a status in a table cell is a status, however it is quoted", () => {
    for (const row of [
      "| Passkey step-up | `planned` |",
      "| Passkey step-up | 'planned' |",
      '| Passkey step-up | "planned" |',
      "| Passkey step-up | `not yet built` (P0.12) |",
    ]) {
      expect(featureIdsIn("a.md", row), row).toEqual(["step-up"]);
    }
    expect(featureIdsIn("a.html", "<table><tr><td>Step-up</td><td><code>planned</code></td></tr></table>")).toEqual([
      "step-up",
    ]);
  });

  it("fenced code, HTML comments, styles and scripts", () => {
    const md = ["```", "step-up: planned", "```", "<!-- step-up planned -->", "Text."].join("\n");
    expect(featureIdsIn("a.md", md)).toEqual([]);
    const html =
      "<style>.step-up::after{content:'planned'}</style><script>var a='step-up planned'</script><p>Fine.</p>";
    expect(featureIdsIn("a.html", html)).toEqual([]);
  });
});

describe("markers", () => {
  it("an allow marker with a reason exempts that feature on its line and the next", () => {
    const md = [
      "<!-- doc-claims: allow northbound-broker: the row contrasts the shipped broker with the planned OAuth endpoint -->",
      "| Broker | built; OAuth for it planned (P2.5) |",
      "",
      "| Broker | planned |",
    ].join("\n");
    const result = claimsIn("a.md", md);
    expect(result.problems).toEqual([]);
    expect(result.claims.map((c) => c.line)).toEqual([4]);
  });

  it("an allow marker without a reason, or naming no feature, is a problem", () => {
    expect(claimsIn("a.md", "<!-- doc-claims: allow step-up -->\nStep-up is planned.").problems).toHaveLength(1);
    expect(claimsIn("a.md", "<!-- doc-claims: allow step-up: x -->\nStep-up is planned.").claims).toHaveLength(1);
    expect(
      claimsIn("a.md", "<!-- doc-claims: allow no-such-feature: a reason long enough -->").problems[0]?.message,
    ).toMatch(/not a feature/);
  });

  it("a historical file is skipped only if it says so where a reader sees it", () => {
    const told =
      "# Spec\n\n<!-- doc-claims: historical -->\n> **Historical build specification.**\n\nThe broker is planned.\n";
    expect(claimsIn("a.md", told)).toEqual({ claims: [], problems: [], historical: true });
    const hidden = "# Spec\n\n<!-- doc-claims: historical -->\n\nThe broker is planned.\n";
    const result = claimsIn("a.md", hidden);
    expect(result.historical).toBe(true);
    expect(result.problems[0]?.message).toMatch(/never tell a reader/);
  });
});

describe("prose units", () => {
  it("splits sentences, keeps table rows whole, and numbers lines from 1", () => {
    expect(sentences("One sentence. Two sentence! Three")).toEqual(["One sentence.", "Two sentence!", "Three"]);
    const { units } = proseUnits("a.md", "# Title\n\nFirst. Second.\n\n| a | b. C |\n", "markdown", IDS);
    expect(units.map((u) => [u.line, u.text])).toEqual([
      [1, "Title"],
      [3, "First."],
      [3, "Second."],
      [5, "| a | b. C |"],
    ]);
  });

  it("HTML units carry the line their element starts on", () => {
    const { units } = proseUnits(
      "a.html",
      "<html>\n<body>\n<p>One.</p>\n<table><tr><td>a</td><td>b</td></tr></table>\n</body>",
      "html",
      IDS,
    );
    expect(units.map((u) => [u.line, u.text])).toEqual([
      [3, "One."],
      [4, "a | b |"],
    ]);
  });
});
