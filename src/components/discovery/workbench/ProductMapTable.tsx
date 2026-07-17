/**
 * ABeam Workbench — C6 Rosetta matrix (THE FENCE).
 *
 * ⚠ CONSULTANT-ONLY. Lives under components/discovery/workbench/, which the
 * dependency-boundary test asserts is unreachable from every (external) entry.
 *
 * "to map" is an honest empty slot, never a fake fill. SAP cells are derived and
 * therefore read-only — an overlay process shows "to map" on SAP because no base
 * reference exists, and no amount of typing here can invent one.
 */

"use client";

import { useState } from "react";
import { PRODUCTS, PRODUCT_LABELS, type Product, type ProductMapRow } from "@/lib/discovery/workbench/product-map";

export interface ProductMapTableProps {
  rows: ProductMapRow[];
}

export function ProductMapTable({ rows }: ProductMapTableProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<Record<string, Record<string, string | null>>>({});

  async function save(scopeId: string, product: Product, value: string) {
    if (product === "sap") return; // derived — not writable, by construction
    setSaving(`${scopeId}:${product}`);
    const key = product === "oracle" ? "oracleRef" : product === "netsuite" ? "netsuiteRef" : "otherRef";
    try {
      const res = await fetch("/api/discovery/product-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: scopeId, [key]: value }),
      });
      if (res.ok) {
        setLocal((s) => ({ ...s, [scopeId]: { ...s[scopeId], [product]: value.trim() || null } }));
        setNote(`Saved ${PRODUCT_LABELS[product]} mapping for ${scopeId}`);
      } else {
        setNote("Could not save that mapping.");
      }
    } catch {
      setNote("Could not save that mapping.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto rounded-input border border-decision-custom bg-paper">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <caption className="sr-only">
            Product map — consultant only, never shared with the client. SAP references are derived
            from the library and cannot be edited; Oracle, NetSuite and other are entered by hand and
            show “to map” until then.
          </caption>
          <thead className="sticky top-0 z-[2] border-b border-decision-custom bg-banner-warn">
            <tr>
              <th scope="col" className="w-[70px] px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-status-awaiting-fg">ID</th>
              <th scope="col" className="px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-status-awaiting-fg">Process</th>
              {PRODUCTS.map((p) => (
                <th key={p} scope="col" className="w-[170px] px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-status-awaiting-fg">
                  {PRODUCT_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scopeId} className="border-b border-ink-tint">
                <th scope="row" className="px-3.5 py-2.5 font-mono text-[11px] font-bold text-navy">{r.scopeId}</th>
                <td className="px-3.5 py-2.5 text-xs text-ink">{r.name}</td>
                {PRODUCTS.map((p) => {
                  const cell = r.cells[p];
                  const value = local[r.scopeId]?.[p] !== undefined ? local[r.scopeId]![p] : cell.ref;
                  if (cell.derived) {
                    return (
                      <td key={p} className="px-3.5 py-2.5">
                        {value ? (
                          <span className="inline-flex h-[22px] items-center rounded-pill bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] px-2.5 text-[11px] font-bold text-decision-standard">
                            <span aria-hidden="true">✓ </span>
                            {value}
                            <span className="sr-only"> mapped (derived from the library)</span>
                          </span>
                        ) : (
                          <span className="inline-flex h-[22px] items-center rounded-pill bg-ink-tint px-2.5 text-[11px] font-bold text-ink-muted">
                            to map
                            <span className="sr-only">
                              {" "}
                              — this process was authored by ABeam, so it has no base reference
                            </span>
                          </span>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={p} className="px-3.5 py-2.5">
                      <label className="sr-only" htmlFor={`${r.scopeId}-${p}`}>
                        {PRODUCT_LABELS[p]} reference for {r.name}
                      </label>
                      <input
                        id={`${r.scopeId}-${p}`}
                        defaultValue={value ?? ""}
                        placeholder="to map"
                        onBlur={(e) => {
                          const next = e.target.value;
                          if ((next.trim() || null) !== value) void save(r.scopeId, p, next);
                        }}
                        disabled={saving === `${r.scopeId}:${p}`}
                        className="h-[26px] w-full rounded-input border border-navy-border bg-navy-soft px-2 text-[11px] text-ink placeholder:font-bold placeholder:text-ink-muted focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[16px] text-[11px] text-ink-muted">{note}</p>
    </>
  );
}
