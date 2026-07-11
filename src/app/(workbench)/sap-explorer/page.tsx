import type { Metadata } from "next";
import { SapCloudExplorer } from "@/components/sap/SapCloudExplorer";

export const metadata: Metadata = { title: "SAP Operations" };
export const dynamic = "force-dynamic";

// Auth + chrome (ABeam Workbench header, sign-out) come from the
// (workbench) layout, which redirects unauthenticated users to
// /presales/login — so this page has no sign-in affordance of its own.
export default function SapExplorerPage() {
  return (
    <main className="mx-auto max-w-[1280px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Plain <a>, not next/link: a full-document navigation back to the
          Workbench home is reliable regardless of route-group boundaries. */}
      <a
        href="/workbench"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-navy"
      >
        <span aria-hidden>&larr;</span> Back to Workbench
      </a>
      <div>
        <h1 className="font-serif text-2xl tracking-tight" style={{ color: "var(--brand-navy)" }}>
          SAP Operations
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
          Live TDD explorer across your connected SAP Cloud products.
        </p>
      </div>
      <SapCloudExplorer />
    </main>
  );
}
