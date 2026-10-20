import type { Metadata } from "next";

import { WorkbenchWritesClient } from "@/components/ops/WorkbenchWritesClient";
import { WriteLedgerClient } from "@/components/ops/WriteLedgerClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Write ledger" };

/**
 * Two records of writes, deliberately kept apart: the broker's (per solution
 * and credential, tenant-scoped) and the Workbench's (per person, platform
 * scope, platform admins only). See WorkbenchWritesClient for why they are not
 * merged into one table.
 */
export default function WriteLedgerPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <WriteLedgerClient />
      <WorkbenchWritesClient />
    </div>
  );
}
