"use client";

/**
 * SapCloudExplorer — product-aware shell for the SAP Operations page.
 *
 * Fetches the connected-product catalog and renders a product switcher
 * (S/4HANA Cloud, SuccessFactors, …). The selected product is threaded
 * into the operations dashboard, write-back panel, and entity explorer,
 * which each fetch `/api/sap/tdd/*?product=<key>`. Products without a
 * configured TDD tenant show a "not configured" notice instead of firing
 * live requests.
 */

import { useEffect, useState } from "react";
import { PlugZap } from "lucide-react";
import { SapOperationsDashboard } from "./SapOperationsDashboard";
import { SapWriteBackPanel } from "./SapWriteBackPanel";
import { SapTenantExplorer } from "./SapTenantExplorer";
import { SapCapabilityCatalogue } from "./SapCapabilityCatalogue";
import { ScreenGuide } from "@/components/affirm/learn/ScreenGuide";
import { SapAribaExplorer } from "./SapAribaExplorer";

interface ProductInfo {
  key: string;
  label: string;
  description: string;
  protocol: "odata" | "rest";
  configured: boolean;
}

export function SapCloudExplorer() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [product, setProduct] = useState("s4hana");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sap/tdd/catalog?product=s4hana")
      .then((r) => r.json())
      .then((j: { data?: { products?: ProductInfo[] } }) => {
        if (cancelled || !j?.data?.products) return;
        setProducts(j.data.products);
        const firstConfigured = j.data.products.find((p) => p.configured);
        if (firstConfigured) setProduct(firstConfigured.key);
      })
      .catch(() => {
        /* switcher stays empty; the dashboard shows its own error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = products.find((p) => p.key === product);

  return (
    <div className="space-y-8" data-sap-explorer>
      {products.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="SAP Cloud product">
            {products.map((p) => {
              const selected = p.key === product;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setProduct(p.key)}
                  disabled={!p.configured}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                    selected
                      ? "border-[var(--brand-navy)] bg-[var(--brand-navy)] text-[var(--ink-on-navy)]"
                      : p.configured
                        ? "border-[var(--border-default)] bg-[var(--surface-paper)] text-[var(--ink-primary)] hover:border-[var(--brand-navy)]"
                        : "cursor-not-allowed border-[var(--border-default)] bg-[var(--surface-ink-tint)] text-[var(--ink-muted)]"
                  }`}
                  title={p.configured ? p.description : `${p.label} has no TDD tenant configured`}
                >
                  <PlugZap className="size-3.5" />
                  {p.label}
                  {!p.configured && <span className="text-xs opacity-70">· not configured</span>}
                </button>
              );
            })}
          </div>
          {active && <p className="text-sm" style={{ color: "var(--ink-secondary)" }}>{active.description}</p>}
        </div>
      )}

      {active && !active.configured ? (
        <div className="rounded-[var(--radius-card-warm)] border border-dashed px-5 py-8 text-sm" style={{ borderColor: "var(--border-strong)", background: "var(--surface-cream)", color: "var(--ink-secondary)" }}>
          <p className="font-medium" style={{ color: "var(--ink-primary)" }}>{active.label} isn&apos;t connected yet.</p>
          <p className="mt-1">
            Add this product&apos;s TDD tenant + credentials to the deployment environment to pull
            live data here (same pattern as S/4HANA). See the deployment env checklist.
          </p>
        </div>
      ) : active?.protocol === "rest" ? (
        <SapAribaExplorer />
      ) : (
        <>
          <div id="sap-capability-catalogue" style={{ scrollMarginTop: 24 }}>
            <ScreenGuide id="sap-catalogue" />
            <SapCapabilityCatalogue product={product} />
          </div>
          <div data-tour="sap-procurement" className="border-t pt-6" style={{ borderColor: "var(--border-default)" }}>
            <ScreenGuide id="sap-procurement" />
            <SapOperationsDashboard product={product} />
          </div>
          <div>
            <ScreenGuide id="sap-write-mode" />
            <SapWriteBackPanel product={product} />
          </div>
          <div id="sap-entity-explorer" data-tour="sap-entity-explorer" className="border-t pt-6" style={{ borderColor: "var(--border-default)", scrollMarginTop: 24 }}>
            <div className="mb-4">
              <h2 className="font-serif text-lg tracking-tight" style={{ color: "var(--brand-navy)" }}>
                Entity Explorer
              </h2>
            </div>
            <ScreenGuide id="sap-entity-explorer" />
            <SapTenantExplorer product={product} />
          </div>
        </>
      )}
    </div>
  );
}
