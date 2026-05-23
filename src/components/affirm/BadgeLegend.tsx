/**
 * BadgeLegend — defines every chip used across the affirm-set surface.
 *
 * v2 CCC follow-up §6. Sits on the review screen so the consultant has
 * a single legend they can refer to while reading any of the other
 * screens.
 */

export function BadgeLegend() {
  return (
    <div className="rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card">
      <header className="mb-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Badge legend
        </p>
        <h3 className="mt-1 font-serif text-xl text-ink">
          The visual vocabulary on this and every other screen
        </h3>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        <Row
          swatch={
            <span className="rounded-pill bg-decision-standard/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-decision-standard">
              8 questions
            </span>
          }
          desc="Scope item carries that many BDC affirm questions."
        />
        <Row
          swatch={
            <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              no affirm-set
            </span>
          }
          desc="Scope item has no affirm-set (not all 672 items do)."
        />
        <Row
          swatch={
            <span className="rounded-pill bg-decision-configure/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-decision-configure">
              Decision
            </span>
          }
          desc="Question has an SAP standard — three-choice format."
        />
        <Row
          swatch={
            <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              Information
            </span>
          }
          desc="Open-response question — no standard to adopt."
        />
        <Row
          swatch={<Dot color="var(--decision-standard)" />}
          desc="Decision: client adopts the SAP standard."
        />
        <Row
          swatch={<Dot color="var(--decision-configure)" />}
          desc="Decision: client wants to discuss in the workshop."
        />
        <Row
          swatch={<Dot color="var(--decision-custom)" />}
          desc="Decision: client does this differently — a reason is recorded."
        />
        <Row
          swatch={
            <span className="rounded-pill bg-banner-warn px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-decision-custom">
              flagged
            </span>
          }
          desc="Flagged: SAP phrased it as configuration how-to, not a business decision."
        />
        <Row
          swatch={
            <span className="rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              SAP-excluded
            </span>
          }
          desc="Excluded: kept in the record but never shown to the client."
        />
        <Row
          swatch={
            <span className="rounded-pill bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy">
              consultant-added
            </span>
          }
          desc="Consultant-added question — not from SAP BDC."
        />
      </ul>
    </div>
  );
}

function Row({ swatch, desc }: { swatch: React.ReactNode; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex min-w-[8rem] justify-start">
        {swatch}
      </span>
      <span className="text-sm text-ink-soft">{desc}</span>
    </li>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-block size-3 rounded-full"
      style={{ background: color }}
    />
  );
}
