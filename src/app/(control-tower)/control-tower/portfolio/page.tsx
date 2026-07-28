import type { Metadata } from "next";

import { PortfolioClient } from "@/components/control-tower/PortfolioClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Solution portfolio" };

export default function PortfolioPage() {
  return <PortfolioClient />;
}
