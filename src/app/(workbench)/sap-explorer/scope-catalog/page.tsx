import type { Metadata } from "next";
import { ProductScopeCatalog } from "@/components/sap/ProductScopeCatalog";
import { getProductScopeCatalog } from "@/lib/product-scope/catalog";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewRestrictedScope } from "@/lib/product-scope/access";

export const metadata: Metadata = { title: "SAP Scope Catalog" };
export const dynamic = "force-dynamic";

export default async function SapScopeCatalogPage() {
  const canImport = canViewRestrictedScope(await getCurrentUser());
  const rows = await getProductScopeCatalog(canImport);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <a href="/sap-explorer" className="text-sm text-[var(--brand-navy)]">← SAP Operations</a>
    <div>
      <h1 className="font-serif text-3xl text-[var(--brand-navy)]">SAP Scope Catalog</h1>
      <p className="mt-2 text-sm text-[var(--ink-secondary)]">One Aptus inventory across S/4HANA, SuccessFactors, Ariba, and future SAP product imports.</p>
      {canImport && <a href="/sap-explorer/scope-catalog/import" className="mt-3 inline-block text-sm font-medium text-[var(--brand-navy)] underline">Import reviewed SAP source content</a>}
    </div>
    <ProductScopeCatalog rows={rows} />
    <section className="rounded-xl border border-[var(--border-default)] bg-white p-5">
      <h2 className="text-lg font-semibold text-[var(--brand-navy)]">Known partner source backlog</h2>
      <p className="mt-2 text-sm text-[var(--ink-secondary)]">
        SAP for Me recently listed these scenario releases. Their scope entries are pending export and reconciliation; this is not a complete list of SAP products.
      </p>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {[
          "SuccessFactors Career and Talent Development · 2605",
          "SuccessFactors Learning · 2511",
          "SuccessFactors Talent Intelligence Hub · 2605",
          "SuccessFactors Employee Central · 2605",
          "SuccessFactors Employee Central Payroll · 2411",
          "SuccessFactors Compensation · 2511",
          "SAP Business Network for Supply Chain · 2608",
        ].map((source) => <li key={source}>• {source}</li>)}
      </ul>
    </section>
  </main>;
}
