"use client";

import { useMemo, useState } from "react";
import type { CatalogRow } from "@/lib/product-scope/catalog";
import { scopeProductLabelKey } from "@/lib/product-scope/presentation";
import { productName } from "@/lib/studio/product-marks";
import { ProductLabel } from "@/components/sap/ProductLabel";

export function ProductScopeCatalog({ rows }: { rows: CatalogRow[] }) {
  const [product, setProduct] = useState("ALL");
  const [query, setQuery] = useState("");
  const products = useMemo(() => [...new Set(rows.map((row) => row.product))], [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (product !== "ALL" && row.product !== product) return false;
    const search = `${row.code} ${row.title} ${row.solution}`.toLowerCase();
    return search.includes(query.trim().toLowerCase());
  }), [rows, product, query]);

  const withSteps = filtered.filter((row) => row.hasSteps).length;
  const withQuestions = filtered.filter((row) => row.hasQuestions).length;
  const withDiagram = filtered.filter((row) => row.hasDiagram).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4" aria-label="Catalog coverage">
        {[["Entries", filtered.length], ["With steps", withSteps], ["With questions", withQuestions], ["With diagrams", withDiagram]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border-default)] bg-white p-4">
            <div className="text-sm text-[var(--ink-secondary)]">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--brand-navy)]">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Product</span>
          <select value={product} onChange={(event) => setProduct(event.target.value)} className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2">
            <option value="ALL">All products</option>
            {products.map((value) => <option key={value} value={value}>{productName(scopeProductLabelKey(value))}</option>)}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          <span>Find a scope item or process</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, title, or solution" className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2" />
        </label>
      </div>
      <p className="text-sm text-[var(--ink-secondary)]">
        Coverage counts describe imported evidence, not every process available from SAP. Open an entry to see its source and any step diagram.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((row) => (
          <a key={`${row.origin}-${row.id}`} href={`/sap-explorer/scope-catalog/${row.origin.toLowerCase()}/${encodeURIComponent(row.id)}`}
            className="rounded-xl border border-[var(--border-default)] bg-white p-4 transition hover:border-[var(--brand-navy)]">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-secondary)]">
              <span className="font-semibold text-[var(--brand-navy)]">{row.code}</span>
              <ProductLabel product={scopeProductLabelKey(row.product)} size={14} /><span>·</span><span>{row.solution}</span><span>·</span><span>{row.release === "SOURCE_UNDATED" ? "Version unverified" : row.release}</span>
              {row.visibility === "ABEAM_ADMIN" && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900">ABeam only</span>}
            </div>
            <h2 className="mt-2 font-medium text-[var(--ink-primary)]">{row.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-1">{row.kind === "PROCESS" ? "Process" : "Scope item"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">Steps {row.hasSteps ? "available" : "missing"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">Questions {row.hasQuestions ? "available" : "missing"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">Diagram {row.hasDiagram ? "available" : "missing"}</span>
            </div>
          </a>
        ))}
      </div>
      {filtered.length === 0 && <p className="rounded-xl border p-6 text-sm">No matching imported content.</p>}
    </div>
  );
}
