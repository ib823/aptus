/**
 * GET /d/export — V7, the print-clean pack (brief §7 V7 + §8).
 *
 * "A4 portrait sequence: cover (client + provenance), L0 ribbon + heatmap,
 * per-stream fit summary, then per-process one-liners with mini-flow thumbnails
 * and the recorded decision. Black-on-white, decision states as label+pattern,
 * page numbers, footer provenance. No interactive affordances rendered."
 *
 * §8's Export rules: strip all chrome and interaction; linearise (ribbon →
 * streams → processes → summary); enforce black-on-white with label+pattern;
 * every colour-carried meaning gets a redundant text label; page breaks between
 * streams; provenance + confidentiality on every page footer.
 *
 * So there is no shell, no mode switch, no links, no buttons — a link in a
 * printed pack is a dead artefact, and on screen it invites clicking something
 * that will not exist on paper. The only affordance is the browser's own print.
 *
 * SEALED vs IN-PROGRESS: the pack renders for both. An in-progress engagement is
 * stamped "Draft — decisions incomplete" on the cover and on every page footer.
 * Printing a half-finished review WITHOUT saying so is exactly the dishonesty
 * invariant 4 exists to prevent — a pack that looks final in a boardroom because
 * nobody noticed the counts do not add up.
 *
 * REGISTER SCOPE: the per-process register lists DECIDED processes only. All 742
 * would be ~120 pages of "Undecided", which is not a document anyone reads; the
 * per-stream summary already carries the undecided counts. Logged as D13.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FitPatternLegend, FitPatternSwatch } from "@/components/discovery/FitPatternSwatch";
import { PROVENANCE_CLIENT } from "@/lib/discovery/copy";
import {
  decisionDetailsForEngagement,
  getDiscoveryHome,
} from "@/lib/discovery/external/journey";
import { isDeviceVerified, requireGuestSession } from "@/lib/discovery/external/guards";
import { isSealed, touchGuestSession } from "@/lib/discovery/external/session";
import { clientValueStreams } from "@/lib/discovery/client-library";
import { fitMixDecided, type FitState } from "@/lib/discovery/fit";
import "./discovery-export.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

const CONFIDENTIAL =
  "Prepared by ABeam Consulting · product-agnostic process discovery · Confidential";

function PageFooter({ page, total, draft }: { page: number; total: number; draft: boolean }) {
  return (
    <footer className="dx-footer">
      <span>{CONFIDENTIAL}</span>
      <span>
        {draft ? "Draft · " : ""}Page {page} of {total}
      </span>
    </footer>
  );
}

export default async function DiscoveryExportPage() {
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/d/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) redirect("/d/verify");
  void touchGuestSession(ctx.session.id);

  const sealed = isSealed(ctx.engagement);
  const view = await getDiscoveryHome({
    engagementId: ctx.engagement.id,
    client: ctx.engagement.client,
    displayName: ctx.grant.displayName,
    roleLabel: ctx.grant.roleLabel,
    valueStreamIds: ctx.grant.valueStreamIds,
    sealed,
  });
  const decisions = await decisionDetailsForEngagement(ctx.engagement.id);

  const totalInScope = view.streams.reduce((n, s) => n + s.processCount, 0);
  const decidedTotal = view.streams.reduce((n, s) => n + s.decided, 0);
  const draft = !sealed || decidedTotal < totalInScope;

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Register rows: decided processes only (D13).
  const scopedIds = new Set(view.streams.map((s) => s.id));
  const register = clientValueStreams()
    .filter((vs) => scopedIds.has(vs.id))
    .map((vs) => ({
      id: vs.id,
      name: vs.name,
      rows: vs.workflows.flatMap((wf) =>
        wf.processes
          .filter((p) => decisions.has(p.id))
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            workflow: wf.name,
            hasFlow: (p.flow?.length ?? 0) > 0,
            steps: p.flow?.length ?? 0,
            decision: decisions.get(p.id)!,
          })),
      ),
    }))
    .filter((s) => s.rows.length > 0);

  // 1 cover + 1 overview + 1 per-stream summary + the register pages. When
  // nothing is decided the register collapses to a single explanatory page, so
  // the count must not read "Page 4 of 3".
  const totalPages = 3 + Math.max(register.length, 1);
  let page = 0;

  return (
    <div className="dx-viewport">
      <div className="dx-root">
        {/* ── Page 1 · Cover ─────────────────────────────────────────────── */}
        <section className="dx-page">
          <p className="dx-eyebrow">Process Discovery</p>
          <h1 className="dx-h1">{view.identity.client}</h1>
          <p className="dx-muted">Discovery pack · {date}</p>
          <hr className="dx-rule" />

          {draft && (
            <p className="dx-draft">
              Draft — decisions incomplete ({decidedTotal} of {totalInScope} processes reviewed)
            </p>
          )}

          <h2 className="dx-h2">How to read this pack</h2>
          <p>
            Each process carries the decision your team recorded. Decisions are shown as a pattern
            and a label — never colour alone, so this reads the same in black and white.
          </p>
          <FitPatternLegend />

          <hr className="dx-hairline" />
          <p className="dx-mono dx-muted" style={{ fontSize: "8pt" }}>
            {PROVENANCE_CLIENT}
          </p>
          <PageFooter page={++page} total={totalPages} draft={draft} />
        </section>

        {/* ── Page 2 · Coverage + linearised ribbon and heatmap ──────────── */}
        <section className="dx-page">
          <p className="dx-eyebrow">Overview</p>
          <h2 className="dx-h2">Your business on one page</h2>
          <p className="dx-muted">
            {view.coverage.processes} business processes · {view.coverage.withFlow} with a step flow
            · {view.coverage.industrySpecific} industry-specific
          </p>

          <hr className="dx-rule" />

          {/* The ribbon, linearised into a table (§8). */}
          <h2 className="dx-h2">Value streams</h2>
          <table className="dx-table">
            <thead>
              <tr>
                <th scope="col">Value stream</th>
                <th scope="col">Reviewed</th>
                <th scope="col">Standard</th>
                <th scope="col">We differ</th>
                <th scope="col">Discuss</th>
                <th scope="col">Not applicable</th>
                <th scope="col">Undecided</th>
              </tr>
            </thead>
            <tbody>
              {view.streams.map((s) => (
                <tr key={s.id}>
                  <th scope="row" style={{ fontWeight: 600 }}>
                    {s.name}
                  </th>
                  <td>
                    {s.decided} / {s.processCount}
                  </td>
                  <td>{s.mix.standard}</td>
                  <td>{s.mix.differ}</td>
                  <td>{s.mix.discuss}</td>
                  <td>{s.mix.na}</td>
                  <td>{s.mix.open}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr className="dx-rule" />

          {/* The heatmap, linearised: rows = streams, cells = workflows with the
              dominant state as pattern + label. The screen version's hover is
              replaced by always-visible text (§8: "a hover-only reveal must gain
              a non-hover equivalent — Export: always-expanded"). */}
          <h2 className="dx-h2">Where you differ</h2>
          <table className="dx-table">
            <thead>
              <tr>
                <th scope="col">Value stream</th>
                <th scope="col">Workflow</th>
                <th scope="col">Processes</th>
                <th scope="col">Dominant decision</th>
              </tr>
            </thead>
            <tbody>
              {view.streams.flatMap((s) =>
                s.workflows.map((wf) => (
                  <tr key={`${s.id}-${wf.name}`}>
                    <th scope="row" style={{ fontWeight: 400 }}>
                      {s.name}
                    </th>
                    <td>{wf.name}</td>
                    <td>{wf.processCount}</td>
                    <td>
                      <FitPatternSwatch state={wf.dominant} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <PageFooter page={++page} total={totalPages} draft={draft} />
        </section>

        {/* ── Page 3 · Per-stream fit summary ────────────────────────────── */}
        <section className="dx-page">
          <p className="dx-eyebrow">Summary</p>
          <h2 className="dx-h2">Decisions by value stream</h2>
          {view.streams.map((s) => (
            <div key={s.id} style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px" }}>
                {s.name}{" "}
                <span className="dx-muted" style={{ fontWeight: 400 }}>
                  — {fitMixDecided(s.mix)} of {s.processCount} reviewed
                </span>
              </p>
              <ul className="dx-legend">
                {(["standard", "differ", "discuss", "na", "open"] as FitState[])
                  .filter((k) => s.mix[k] > 0)
                  .map((k) => (
                    <li key={k}>
                      <FitPatternSwatch state={k} /> <strong>{s.mix[k]}</strong>
                    </li>
                  ))}
              </ul>
              <hr className="dx-hairline" />
            </div>
          ))}
          <PageFooter page={++page} total={totalPages} draft={draft} />
        </section>

        {/* ── Register · one page per stream (§8: page breaks between streams) */}
        {register.map((s) => (
          <section key={s.id} className="dx-page">
            <p className="dx-eyebrow">Process register</p>
            <h2 className="dx-h2">{s.name}</h2>
            <table className="dx-table">
              <thead>
                <tr>
                  <th scope="col">Ref</th>
                  <th scope="col">Process</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="dx-chip">{r.id}</span>
                    </td>
                    <td>
                      <strong>{r.name}</strong>
                      <br />
                      <span className="dx-muted">{r.description}</span>
                      <br />
                      <span className="dx-muted dx-mono" style={{ fontSize: "7.5pt" }}>
                        {r.workflow} ·{" "}
                        {r.hasFlow ? `${r.steps} steps` : "No step flow catalogued"}
                      </span>
                      {r.decision.status === "differ" && (
                        <p className="dx-reason">
                          {r.decision.reason ?? "No reason captured yet."}
                        </p>
                      )}
                    </td>
                    <td>
                      <FitPatternSwatch state={r.decision.status} />
                      {!r.decision.complete && (
                        <>
                          <br />
                          <span className="dx-muted" style={{ fontSize: "7.5pt" }}>
                            Incomplete
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PageFooter page={++page} total={totalPages} draft={draft} />
          </section>
        ))}

        {register.length === 0 && (
          <section className="dx-page">
            <p className="dx-eyebrow">Process register</p>
            <h2 className="dx-h2">No decisions recorded yet</h2>
            <p className="dx-muted">
              Once your team records decisions, each one appears here with its reference, the
              process, and — where you differ — the reason you gave. Every value stream in scope is
              already summarised on the previous pages.
            </p>
            <PageFooter page={++page} total={totalPages} draft={draft} />
          </section>
        )}
      </div>
    </div>
  );
}
