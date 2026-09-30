import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductScopeImport } from "@/components/sap/ProductScopeImport";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewRestrictedScope } from "@/lib/product-scope/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import SAP Scope Content" };

export default async function ImportProductScopePage() {
  if (!canViewRestrictedScope(await getCurrentUser())) notFound();
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
    <a href="/sap-explorer/scope-catalog" className="text-sm text-[var(--brand-navy)]">← SAP Scope Catalog</a>
    <div>
      <h1 className="font-serif text-3xl text-[var(--brand-navy)]">Import SAP scope content</h1>
      <p className="mt-2 text-sm text-[var(--ink-secondary)]">ABeam admin access only. Import reviewed source records with their product, version, country, and evidence links.</p>
    </div>
    <ProductScopeImport />
  </main>;
}
