/**
 * C10 · Library health — /discovery/health.
 *
 * Provenance and completeness governance. Every figure is computed or read from
 * the committed MANIFEST — no literals, no `|| 654` fallbacks, no invented audit
 * trail (D16).
 */

import type { Metadata } from "next";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { libraryHealth } from "@/lib/discovery/workbench/health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library health" };

export default function HealthPage() {
  const h = libraryHealth();
  const total = h.processes;
  const seg = (n: number) => `${(n / total) * 100}%`;

  return (
    <WorkbenchView
      breadcrumb="Library health"
      title="Library health"
      caption={`Provenance and completeness governance for the ${total}-process library.`}
    >
      {h.stale && (
        <p className="mb-5 rounded-input border border-decision-custom/30 bg-banner-warn px-4 py-3 text-[13px] text-ink-soft">
          <strong className="font-semibold text-decision-custom">This library is {h.ageDays} days old.</strong>{" "}
          The next refresh arrives as a data-only re-emission with a new MANIFEST.
        </p>
      )}

      <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { v: String(total), l: "Total processes", c: "text-navy" },
          { v: `${Math.round(h.flowShare * 100)}%`, l: "With a step flow", c: "text-decision-standard" },
          { v: String(h.gapCategories), l: `Gap categories of ${h.apqcCategories}`, c: "text-decision-custom" },
          { v: `${h.ageDays}d`, l: "Since last refresh", c: h.stale ? "text-decision-custom" : "text-navy" },
        ].map((t) => (
          <li key={t.l} className="rounded-input border border-border-default bg-paper px-3.5 py-4">
            <p className={`font-serif text-2xl font-medium ${t.c}`}>{t.v}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase text-ink-muted">{t.l}</p>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        Completeness distribution
      </h2>
      <div className="mb-1.5 flex h-2.5 max-w-[500px] overflow-hidden rounded-pill bg-ink-tint" aria-hidden="true">
        <div className="bg-decision-standard" style={{ width: seg(h.completeness.detailedVariants) }} />
        <div className="bg-navy" style={{ width: seg(h.completeness.detailed) }} />
        <div className="bg-ink-disabled" style={{ width: seg(h.completeness.outline) }} />
      </div>
      <ul className="mb-7 flex flex-wrap gap-4 text-[11px] text-ink-soft">
        <li>Detailed + variants ({h.completeness.detailedVariants})</li>
        <li>Detailed ({h.completeness.detailed})</li>
        <li>Outline ({h.completeness.outline})</li>
        <li>No flow catalogued ({h.completeness.none})</li>
      </ul>

      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        Origin
      </h2>
      <ul className="mb-7 flex flex-wrap gap-4 text-[11px] text-ink-soft">
        <li>Base catalogue ({h.origin.sapBase})</li>
        <li>ABeam overlay ({h.origin.overlay})</li>
      </ul>

      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        Integrity
      </h2>
      <div className="overflow-auto rounded-input border border-border-default bg-paper">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Pinned dataset hashes and their algorithm.</caption>
          <thead className="bg-ink-tint">
            <tr>
              <th scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">File</th>
              <th scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">Pinned hash</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(h.hashes).map(([file, hash]) => (
              <tr key={file} className="border-b border-ink-tint">
                <th scope="row" className="px-3.5 py-2.5 text-xs font-normal text-ink">{file}</th>
                <td className="px-3.5 py-2.5 font-mono text-[11px] text-ink-soft">{hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        {h.hashAlgorithm} · generated {h.generated} · {h.source}
      </p>
      <p className="mt-1 text-[11px] text-ink-muted">
        CI verifies these hashes against the files on every run. A change outside a data-only
        re-emission is a failure, not a refresh.
      </p>
    </WorkbenchView>
  );
}
