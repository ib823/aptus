import type { Metadata } from "next";

import { ConnectionRegisterClient } from "@/components/control-tower/RegistersClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connection register" };

export default function ConnectionRegisterPage() {
  return <ConnectionRegisterClient />;
}
