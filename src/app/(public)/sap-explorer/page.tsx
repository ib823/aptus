import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SapOperationsDashboard } from "@/components/sap/SapOperationsDashboard";
import { SapTenantExplorer } from "@/components/sap/SapTenantExplorer";
import { SapWriteBackPanel } from "@/components/sap/SapWriteBackPanel";

export const metadata: Metadata = { title: "SAP Operations" };
export const dynamic = "force-dynamic";

export default async function SapExplorerPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/dev-login?callbackUrl=/sap-explorer");
  }

  return (
    <main className="mx-auto max-w-[1280px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SAP Operations</h1>
      </div>
      <SapOperationsDashboard />
      <SapWriteBackPanel />
      <div className="border-t pt-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Entity Explorer</h2>
        </div>
        <SapTenantExplorer />
      </div>
    </main>
  );
}
