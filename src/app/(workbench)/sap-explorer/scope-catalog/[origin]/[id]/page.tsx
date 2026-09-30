import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScopeDetail } from "@/lib/product-scope/detail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SAP Scope Detail" };

export default async function ScopeCatalogDetailPage({ params }: { params: Promise<{ origin: string; id: string }> }) {
  const { origin, id } = await params;
  const item = await getScopeDetail(origin, id);
  if (!item) notFound();
  const diagramUrl = `/api/product-scope/diagram/${origin}/${encodeURIComponent(id)}`;
  return <main className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6">
    <a href="/sap-explorer/scope-catalog" className="text-sm text-[var(--brand-navy)]">← SAP Scope Catalog</a>
    <header>
      <div className="text-sm text-[var(--ink-secondary)]">{item.product} · {item.solution} · {item.release === "SOURCE_UNDATED" ? "Version unverified" : item.release}</div>
      <h1 className="mt-2 font-serif text-3xl text-[var(--brand-navy)]">{item.code} · {item.title}</h1>
      <p className="mt-2 text-sm text-[var(--ink-secondary)]">{item.kind === "PROCESS" ? "SAP documented process" : "SAP scope item"} · {item.sourceKind}</p>
      {item.description && <p className="mt-3 max-w-3xl">{item.description}</p>}
      {item.sourceUrl?.startsWith("https://") && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-[var(--brand-navy)] underline">Open source record ↗</a>}
    </header>
    <section className="rounded-xl border border-[var(--border-default)] bg-white p-5">
      <h2 className="text-xl font-semibold text-[var(--brand-navy)]">Process flow and diagram</h2>
      {item.steps.length > 0 ? <>
        <p className="mt-2 text-sm text-[var(--ink-secondary)]">Aptus generated this diagram from {item.steps.length} ordered imported activities. Check the source for branches and configuration variants.</p>
        <div className="mt-4 max-h-[650px] overflow-auto rounded-lg border bg-slate-50">
          {/* SVG is served through an authenticated route and XML-escaped. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diagramUrl} alt={`Aptus process diagram for ${item.code}`} className="min-w-[700px]" />
        </div>
        <a href={diagramUrl} download={`${item.code}-process.svg`} className="mt-3 inline-block text-sm text-[var(--brand-navy)] underline">Download SVG diagram</a>
      </> : <p className="mt-3 text-sm text-[var(--ink-secondary)]">Ordered process steps have not been imported, so Aptus cannot generate a faithful diagram yet.</p>}
      {item.processSourceUrl && <a href={item.processSourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm text-[var(--brand-navy)] underline">Open SAP process source ↗</a>}
      {item.steps.length > 0 && <ol className="mt-5 space-y-2 border-t pt-4">
        {item.steps.map((step) => <li key={step.sequence} className="text-sm"><strong>{step.sequence}.</strong> {step.title}{step.role && <span className="text-[var(--ink-secondary)]"> · {step.role}</span>}</li>)}
      </ol>}
    </section>
    <section className="rounded-xl border border-[var(--border-default)] bg-white p-5">
      <h2 className="text-xl font-semibold text-[var(--brand-navy)]">Configuration and discovery</h2>
      {item.questions.length > 0 ? <ol className="mt-3 space-y-2">
        {item.questions.map((question) => <li key={question.key} className="text-sm"><strong>{question.key}.</strong> {question.question}{question.sourceUrl && <a href={question.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[var(--brand-navy)] underline">Source</a>}</li>)}
      </ol> : <p className="mt-3 text-sm text-[var(--ink-secondary)]">No source backed questions have been imported for this entry.</p>}
      {item.configSourceUrl && <a href={item.configSourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm text-[var(--brand-navy)] underline">Open SAP configuration source ↗</a>}
    </section>
  </main>;
}
