/**
 * 2608 WS6 — the To-Be Process Pack on screen. Server component, shared by
 * the consultant page (/tobe/[engagementId]) and the client page (/a/tobe).
 *
 *   L1  the end-to-end chain as inline SVG (string renderer, no client JS)
 *   L2  one swimlane SVG per scope item
 *   L3  the step table under every L2 — the same rows the PDF prints, and the
 *       accessible fallback for the drawings (every SVG is role="img" with a
 *       label; the table carries the data)
 *
 * The client view receives `clientView(doc)`: consultant notes are already
 * gone, so this component never has to decide what to hide.
 */
import { STATE_STYLE, l3Rows, renderL1Svg, renderL2Svg } from "@/lib/tobe/svg";
import type { TobePackDoc, TobeStepState } from "@/lib/tobe/types";

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Step states">
      {(Object.keys(STATE_STYLE) as TobeStepState[]).map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm border"
            style={{
              background: STATE_STYLE[s].fill,
              borderColor: STATE_STYLE[s].stroke,
              borderStyle: STATE_STYLE[s].dash ? "dashed" : "solid",
            }}
          />
          {STATE_STYLE[s].label}
        </li>
      ))}
    </ul>
  );
}

function StatePill({ state }: { state: TobeStepState }) {
  const st = STATE_STYLE[state];
  return (
    <span
      className="inline-flex rounded-pill px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: st.fill, color: st.stroke }}
    >
      {st.label}
    </span>
  );
}

export function PackView({ doc, consultantView }: { doc: TobePackDoc; consultantView: boolean }) {
  const s = doc.summary;
  return (
    <div className="space-y-10" data-testid="tobe-pack" data-inputs-hash={doc.hashes.inputs}>
      <section aria-labelledby="tobe-summary">
        <h2 id="tobe-summary" className="sr-only">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Scope items", s.scopeItems],
            ["Steps", s.steps],
            ["Standard", s.byState.STANDARD],
            ["Configured", s.byState.CONFIGURED],
            ["Variant", s.byState.VARIANT],
            ["Gap", s.byState.GAP],
            ["Confirm in workshop", s.confirmInWorkshop],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-card-warm border border-border-default bg-paper p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
              <dd className="font-serif text-2xl text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          Content release {doc.release} · generated {doc.generatedAt} · inputs {doc.hashes.inputs.slice(0, 12)} ·{" "}
          {s.answered} answered · {s.unansweredQuestions} unanswered
        </p>
        {doc.answersOutsideScope.length > 0 && (
          <p className="mt-1 text-xs text-ink-muted" data-testid="tobe-outside-scope">
            {doc.answersOutsideScope.length} answer(s) name no scope item in this engagement and are not placed on any
            step: {doc.answersOutsideScope.map((a) => `${a.questionId} (${a.choice})`).join(", ")} — for the workshop
            list.
          </p>
        )}
      </section>

      <section aria-labelledby="tobe-l1">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 id="tobe-l1" className="font-serif text-xl text-ink">
            L1 · End-to-end process
          </h2>
          <Legend />
        </div>
        <div
          className="overflow-x-auto rounded-card-warm border border-border-default bg-paper p-2"
          data-testid="tobe-l1"
          dangerouslySetInnerHTML={{ __html: renderL1Svg(doc) }}
        />
        {doc.chains.length === 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            No checked-in end-to-end chain touches this scope set; the L1 shows the scope items in order.
          </p>
        )}
      </section>

      {doc.scopeItems.map((item) => (
        <section key={item.code} aria-labelledby={`tobe-l2-${item.code}`} data-testid={`tobe-item-${item.code}`}>
          <header className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id={`tobe-l2-${item.code}`} className="font-serif text-xl text-ink">
              L2 · {item.code} · {item.title}
            </h2>
            <p className="text-xs text-ink-muted">
              {item.inScope ? "in scope" : "not in scope"} · {item.steps.length} steps · {item.configurations.length}{" "}
              configuration(s) · {item.gaps.length} gap(s)
              {item.confirmInWorkshop ? " · confirm in workshop" : ""}
            </p>
          </header>
          {item.hasBpd ? (
            <>
              <div
                className="overflow-x-auto rounded-card-warm border border-border-default bg-paper p-2"
                data-testid={`tobe-l2-${item.code}`}
                dangerouslySetInnerHTML={{ __html: renderL2Svg(item) }}
              />
              <div className="mt-3 overflow-x-auto rounded-card-warm border border-border-default bg-paper">
                <table className="w-full text-left text-sm">
                  <caption className="px-3 py-2 text-left text-xs text-ink-muted">
                    L3 · {item.code} steps with state, role, app and evidence
                  </caption>
                  <thead>
                    <tr className="border-b border-border-default text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                      <th scope="col" className="px-3 py-2">
                        #
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Step
                      </th>
                      <th scope="col" className="px-3 py-2">
                        State
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Role
                      </th>
                      <th scope="col" className="px-3 py-2">
                        App
                      </th>
                      <th scope="col" className="px-3 py-2">
                        SSCUI
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {l3Rows(item).map((r) => (
                      <tr key={r.index} className="border-b border-border-default/60 align-top">
                        <td className="px-3 py-2 text-ink-muted">{r.index}</td>
                        <th scope="row" className="px-3 py-2 font-medium text-ink">
                          {r.step}
                          {r.marker && <span className="block text-xs font-normal text-ink-muted">{r.marker}</span>}
                        </th>
                        <td className="px-3 py-2">
                          <StatePill state={r.state} />
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{r.role}</td>
                        <td className="px-3 py-2 text-ink-soft">{r.app}</td>
                        <td className="px-3 py-2 text-ink-soft">{r.sscui}</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{r.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="rounded-card-warm border border-dashed border-border-default bg-paper p-4 text-sm text-ink-soft">
              No 2608 business process document is loaded for {item.code}; no steps are drawn. Nothing is inferred.
            </p>
          )}
          {(item.configurations.length > 0 || item.gaps.length > 0) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {item.configurations.length > 0 && (
                <div className="rounded-card-warm border border-border-default bg-paper p-4">
                  <h3 className="text-sm font-semibold text-ink">Configurations</h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                    {item.configurations.map((c) => (
                      <li key={c.ruleId}>
                        SSCUI {c.sscuiId}
                        {c.sscuiName ? ` ${c.sscuiName}` : ""} · {c.questionId} ({c.choice}) ·{" "}
                        {c.scopeWide ? "scope-wide" : c.stepNames.join(", ")}
                        {c.reason ? <span className="block text-xs text-ink-muted">“{c.reason}”</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {item.gaps.length > 0 && (
                <div className="rounded-card-warm border border-border-default bg-paper p-4">
                  <h3 className="text-sm font-semibold text-ink">Gaps</h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                    {item.gaps.map((g) => (
                      <li key={`${g.questionId}-${g.ruleId ?? "x"}`}>
                        {g.questionId} · {g.gapType ?? "unclassified — confirm in workshop"}
                        {g.reason ? <span className="block text-xs text-ink-muted">“{g.reason}”</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {consultantView && doc.consultantNotes?.[item.code] && (
            <p className="mt-3 rounded-card-warm border border-border-default bg-cream p-3 text-sm text-ink-soft">
              <span className="font-semibold text-ink">Consultant note (internal): </span>
              {doc.consultantNotes[item.code]}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
