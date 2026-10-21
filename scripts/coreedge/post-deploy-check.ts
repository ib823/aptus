/**
 * `pnpm release:post-deploy-check` — step 5 of the CoreEdge release protocol
 * (P0.17, docs/runbooks/coreedge-release.md).
 *
 * Run it right after a production promote (and in step 3 against the
 * preview). It makes one SAP-standard read, one Z* read and one refused call
 * through the northbound broker with the release canary's key, finds each
 * call's audit row by correlation id, and prints a pass/fail checklist.
 *
 *   pnpm release:post-deploy-check              the checklist
 *   pnpm release:post-deploy-check --markdown   the deploy record, to post on
 *                                               the merged pull request
 *   pnpm release:post-deploy-check --json       machine-readable
 *
 * Settings (environment only; see .env.example, "Release tooling"):
 *   COREEDGE_CHECK_BASE_URL            the deployment, origin only
 *   COREEDGE_CHECK_KEY                 the canary app's runtime key
 *   COREEDGE_CHECK_STANDARD_INTERFACE  its SAP-standard interface id
 *   COREEDGE_CHECK_CUSTOM_INTERFACE    its Z* or YY1_* interface id
 *   COREEDGE_CHECK_AUDIT_DATABASE_URL  a read-only URL of the same database
 *   COREEDGE_CHECK_CUSTOM_KEY          optional: when the Z* interface is another app's
 *   COREEDGE_CHECK_REFUSED_INTERFACE   optional: an interface with no grant (403);
 *                                      otherwise an unknown id is used (404)
 *   COREEDGE_CHECK_EXPECT_COMMIT       optional: fail unless this commit is serving
 *   COREEDGE_CHECK_PROTECTION_BYPASS   optional: Vercel protection bypass, for a preview
 *
 * It never prints a key, the bypass secret, a database URL or an SAP record.
 *
 * Exit codes: 0 every check passed; 1 a check failed; 2 the settings are
 * incomplete.
 */

import { PrismaClient } from "@prisma/client";

import {
  type AuditRow,
  formatMarkdown,
  formatText,
  readPostDeployConfig,
  runPostDeployCheck,
  secretsOf,
} from "../lib/post-deploy-check";
import { redactSecrets } from "../lib/redact";

const USAGE = "usage: tsx scripts/coreedge/post-deploy-check.ts [--markdown | --json]";

async function main(argv: readonly string[]): Promise<number> {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--markdown" && argv[0] !== "--json")) {
    console.error(USAGE);
    return 2;
  }
  const format = argv[0] === "--markdown" ? "markdown" : argv[0] === "--json" ? "json" : "text";

  const parsed = readPostDeployConfig(process.env);
  if (!parsed.ok) {
    console.error("The post-deploy check is not configured:");
    for (const p of parsed.problems) console.error(`  - ${p}`);
    console.error("See docs/runbooks/coreedge-release.md, \"The release canary\".");
    return 2;
  }
  const config = parsed.config;

  // Its own client, not the app's: this is an operator's read of the audit
  // table by the correlation ids the deployment just returned, nothing else.
  const audit = new PrismaClient({ datasourceUrl: config.auditDatabaseUrl });
  try {
    const report = await runPostDeployCheck(config, {
      fetch,
      findAuditRows: async (correlationIds): Promise<AuditRow[]> =>
        audit.northboundAuditEvent.findMany({
          where: { correlationId: { in: [...correlationIds] } },
          select: { correlationId: true, status: true, interfaceId: true },
        }),
    });
    const out = format === "markdown" ? formatMarkdown(report) : format === "json" ? JSON.stringify(report, null, 2) : formatText(report);
    // Every field was redacted as it was written; this is the last guard.
    console.log(redactSecrets(out, secretsOf(config)));
    return report.ok ? 0 : 1;
  } finally {
    await audit.$disconnect();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const known = [
      process.env.COREEDGE_CHECK_KEY,
      process.env.COREEDGE_CHECK_CUSTOM_KEY,
      process.env.COREEDGE_CHECK_PROTECTION_BYPASS,
      process.env.COREEDGE_CHECK_AUDIT_DATABASE_URL,
    ];
    console.error(redactSecrets(`post-deploy check crashed: ${err instanceof Error ? err.message : String(err)}`, known));
    process.exit(2);
  },
);
