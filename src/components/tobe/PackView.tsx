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
import type { TobeDisposition, TobePackDoc, TobeStepState } from "@/lib/tobe/types";

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

/**
 * 2608 WS14 — the pre-award reading. Deliberately NOT coloured like a state:
 * a state is what the step is, a disposition is whether we can assert it, and
 * two colour systems that look alike would be read as one.
 */
const DISPOSITION_STYLE: Record<TobeDisposition, { background: string; color: string }> = {
  SAP_STANDARD_CITED: { background: "#E8F1E9", color: "#1F5B33" },
  CONFIRM_WITH_CLIENT: { background: "#FDF1DC", color: "#8B5A00" },
  NOT_IN_SCOPE: { background: "#F1F1F1", color: "#6B6B6B" },
};

function DispositionPill({ disposition, label }: { disposition: TobeDisposition; label: string }) {
  return (
    <span className="inline-flex rounded-pill px-2 py-0.5 text-[11px] font-semibold" style={DISPOSITION_STYLE[disposition]}>
      {label}
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
          {item.hasSteps ? (
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
                        Reading
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
                        <td className="px-3 py-2">
                          <DispositionPill disposition={r.disposition} label={r.dispositionLabel} />
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-muted">{r.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="rounded-card-warm border border-dashed border-border-default bg-paper p-4 text-sm text-ink-soft">
              No SAP publication aptus holds carries process steps for {item.code} — neither a business process
              document nor the process-step master. No steps are drawn, because drawing one would mean inventing it.
              {item.stepsExcludedByCountry > 0 && (
                <span className="mt-1 block">
                  {item.stepsExcludedByCountry} step(s) exist for this item but fall outside the engagement&rsquo;s
                  country footprint.
                </span>
              )}
            </p>
          )}
          {(item.forms.length > 0 || item.integrations.length > 0) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {item.forms.length > 0 && (
                <div className="rounded-card-warm border border-border-default bg-paper p-4">
                  <h3 className="text-sm font-semibold text-ink">Forms SAP ships ({item.forms.length})</h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                    {item.forms.map((f) => (
                      <li key={`${f.name}-${f.outputType}-${f.adobeFormTemplate}`}>
                        {f.name}
                        <span className="block text-xs text-ink-muted">
                          {f.applicationArea} · {f.applicationObject} · output {f.outputType} · template{" "}
                          {f.adobeFormTemplate}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-muted">
                    A form SAP ships is not a form you have approved. Each needs review, branding and testing.
                  </p>
                </div>
              )}
              {item.integrations.length > 0 && (
                <div className="rounded-card-warm border border-border-default bg-paper p-4">
                  <h3 className="text-sm font-semibold text-ink">
                    Integrations SAP publishes ({item.integrations.length})
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                    {item.integrations.map((i) => (
                      <li key={i.commScenarioId}>
                        {i.commScenarioId}
                        {/* SAP names 62 of 496 scenarios in the published slice. A
                            placeholder here would read as a name SAP gave it. */}
                        {i.name ? ` — ${i.name}` : ""}
                        <span className="block text-xs text-ink-muted">
                          {i.name ? "" : "name not published by SAP · "}
                          {i.direction ? `${i.direction} · ` : ""}
                          {i.mandatory ? `${i.mandatory} · ` : ""}
                          {i.apiIds.length > 0 ? `${i.apiIds.length} interface(s)` : "no interfaces published"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
