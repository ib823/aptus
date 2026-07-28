import type { Metadata } from "next";

import { WriteLedgerClient } from "@/components/ops/WriteLedgerClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Write ledger" };

export default function WriteLedgerPage() {
  return <WriteLedgerClient />;
}
