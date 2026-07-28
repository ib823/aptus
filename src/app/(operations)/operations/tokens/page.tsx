import type { Metadata } from "next";

import { TokensClient } from "@/components/ops/TokensClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tokens" };

export default function TokensPage() {
  return <TokensClient />;
}
