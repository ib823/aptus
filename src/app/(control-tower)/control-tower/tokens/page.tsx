import type { Metadata } from "next";

import { CredentialRegisterClient } from "@/components/control-tower/RegistersClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Credential register" };

export default function CredentialRegisterPage() {
  return <CredentialRegisterClient />;
}
