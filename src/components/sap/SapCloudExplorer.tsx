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
import { SapCapabilityPanel } from "./SapCapabilityPanel";
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
    <div className="space-y-8">
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
                      ? "border-foreground bg-foreground text-background"
                      : p.configured
                        ? "border-border bg-card text-foreground hover:border-foreground/50"
                        : "cursor-not-allowed border-border bg-muted/40 text-muted-foreground"
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
          {active && <p className="text-sm text-muted-foreground">{active.description}</p>}
        </div>
      )}

      {active && !active.configured ? (
        <div className="rounded-md border border-dashed bg-card px-5 py-8 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{active.label} isn&apos;t connected yet.</p>
          <p className="mt-1">
            Add this product&apos;s TDD tenant + credentials to the deployment environment to pull
            live data here (same pattern as S/4HANA). See the deployment env checklist.
          </p>
        </div>
      ) : active?.protocol === "rest" ? (
        <SapAribaExplorer />
      ) : (
        <>
          <SapOperationsDashboard product={product} />
          <div className="border-t pt-6">
            <SapCapabilityPanel product={product} />
          </div>
          <SapWriteBackPanel product={product} />
          <div className="border-t pt-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">Entity Explorer</h2>
            </div>
            <SapTenantExplorer product={product} />
          </div>
        </>
      )}
    </div>
  );
}
