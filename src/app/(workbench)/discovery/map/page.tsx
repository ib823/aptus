/**
 * C6 · Product map (Rosetta) — /discovery/map. THE FENCE.
 *
 * ⚠ This route exists ONLY under (workbench). Brief §7-C6: "Must never be
 * reachable from a client session." §9.2: fenced with guard label + banner-warn
 * hairline + lock.
 *
 * The context chip reads "Consultant only — not shared" here, NOT the default
 * "Editing library" (D15). §9.1 makes the chip's whole job telling the
 * consultant whether the surface is internal-only; the .dc's default would have
 * it claim "Editing library" on the one view where being wrong is worst.
 */

import type { Metadata } from "next";
import { ConsultantOnlyBanner } from "@/components/discovery/workbench/ConsultantOnlyGuard";
import { ProductMapTable } from "@/components/discovery/workbench/ProductMapTable";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { loadProductMap, productCoverage } from "@/lib/discovery/workbench/product-map";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Product map", robots: { index: false, follow: false } };

const CAPTION =
  "Neutral process → product building block. SAP is derived from the discovery library; Oracle, NetSuite and other are honestly unmapped until a consultant binds them — no fake fills.";

export default async function ProductMapPage() {
  const rows = await loadProductMap();
  const coverage = productCoverage(rows);

  return (
    <WorkbenchView
      breadcrumb="Product map"
      title="Product map (Rosetta)"
      context="consultant-only"
      banner={<ConsultantOnlyBanner caption={CAPTION} />}
    >
      {/* Per-product coverage meters (§6B.8) — computed, never a fixture. The
          .dc pre-colours Oracle/NetSuite grey regardless of value; these read
          their real share. */}
      <ul className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {coverage.map((c) => (
          <li key={c.product} className="rounded-input border border-border-default bg-paper px-4 py-3.5">
            <p className="font-serif text-[22px] font-medium text-navy">
              {Math.round(c.share * 100)}%
            </p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase text-ink-muted">
              {c.label} mapped
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-pill bg-ink-tint"
              role="meter"
              aria-valuenow={c.mapped}
              aria-valuemin={0}
              aria-valuemax={c.total}
              aria-label={`${c.label}: ${c.mapped} of ${c.total} processes mapped`}
            >
              <div
                className={c.share > 0 ? "h-full bg-decision-standard" : "h-full"}
                style={{ width: `${c.share * 100}%` }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] text-ink-muted">
              {c.mapped} / {c.total}
            </p>
          </li>
        ))}
      </ul>

      <ProductMapTable rows={rows} />
    </WorkbenchView>
  );
}
