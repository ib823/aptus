"use client";

import { useState, type ReactNode } from "react";

import { CheckList } from "@/components/coreedge/CheckList";
import { CommandBar } from "@/components/coreedge/CommandBar";
import { ConfirmDialog } from "@/components/coreedge/ConfirmDialog";
import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { FieldPicker } from "@/components/coreedge/FieldPicker";
import { GateStrip, hopsFromBreak } from "@/components/coreedge/GateStrip";
import { LaneCard } from "@/components/coreedge/LaneCard";
import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { NeedsYouRow } from "@/components/coreedge/NeedsYouRow";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { Rail } from "@/components/coreedge/Rail";
import { KeepLastKnown, SkeletonRow } from "@/components/coreedge/SkeletonRow";
import { AppStatusChip, StatusChip } from "@/components/coreedge/StatusChip";
import { WhyTrace } from "@/components/coreedge/WhyTrace";
import {
  ACTIONS,
  CONFIRMATIONS,
  DISABLED_REASONS,
  EMPTY_STATES,
  LANE_DETAIL,
  WHY_CASE_HOP,
  deactivateSapSystemConfirm,
  operationsAllHealthy,
  whyExplanation,
  type WhyCase,
} from "@/lib/coreedge/copy";
import {
  APP_STATUSES,
  APP_STATUS_VOCABULARY,
  GATE_GLYPHS,
  GATE_TOKENS,
  HOP_LABELS,
  LANE_HOPS,
  LANE_STATUSES,
  LANE_STATUS_VOCABULARY,
  OWNER_LABELS,
  STATUS_LITERAL_MAP,
  chipTextFor,
} from "@/lib/coreedge/status-vocabulary";

/**
 * Every specimen below is DERIVED, never listed.
 *
 * The sections iterate LANE_STATUSES, GATE_TOKENS, LANE_HOPS and
 * STATUS_LITERAL_MAP rather than naming their members, so a nineteenth status or
 * an 88th literal appears here the moment it exists. A reference page that has
 * to be updated by hand is a reference page that is quietly wrong within a
 * month — and people trust it, which is what makes that worse than having none.
 */

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-[color:var(--border-default)] pt-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-ink">{title}</h2>
        <p className="max-w-prose text-sm text-ink-soft">{intro}</p>
      </div>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs text-ink-muted">{label}</p>
      <div className="rounded-[var(--radius-card-warm)] border border-[color:var(--border-default)] bg-paper p-4">
        {children}
      </div>
    </div>
  );
}

const SAMPLE_FIELDS = [
  "PurchaseOrder",
  "PurchaseOrderType",
  "CompanyCode",
  "Supplier",
  "DocumentCurrency",
  "CreationDate",
  "NetAmount",
];

const RAIL_PLACES = [
  { href: "/coreedge", label: "Home", short: "Home" },
  { href: "/coreedge/catalogue", label: "Catalogue", short: "Cat" },
  { href: "/coreedge/requests", label: "Requests", short: "Req" },
  { href: "/coreedge/operations", label: "Operations", short: "Ops" },
  { href: "/coreedge/sap-systems", label: "SAP systems", short: "SAP" },
  { href: "/coreedge/passport", label: "Passport", short: "Pass" },
];

export function DesignSystemClient(): ReactNode {
  const [chosen, setChosen] = useState<readonly string[]>(SAMPLE_FIELDS.slice(0, 3));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium text-ink">CoreEdge design system</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Every component in every state, rendered by the same modules the product uses. Nothing
          here is a screenshot or a second copy of a list — the page reads{" "}
          <code className="font-mono text-xs">status-vocabulary.ts</code> and{" "}
          <code className="font-mono text-xs">copy.ts</code> directly, so it cannot drift from what
          ships.
        </p>
      </header>

      {/* ── The vocabulary ─────────────────────────────────────────────── */}
      <Section
        id="statuses"
        title={`The ${LANE_STATUSES.length} lane statuses`}
        intro="A status earns its own wording only when it changes who fixes it — which is why 401 and 403 are separate, and why System off is not SAP unavailable. There is deliberately no 'checking' status: a lane keeps its last known state while a re-check runs."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">The lane status vocabulary</caption>
            <thead>
              <tr className="bg-cream text-left">
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Chip</th>
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Broken hop</th>
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Who fixes it</th>
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Means</th>
              </tr>
            </thead>
            <tbody>
              {LANE_STATUSES.map((status) => {
                const def = LANE_STATUS_VOCABULARY[status];
                return (
                  <tr key={status} className="border-b border-[color:var(--border-default)] last:border-b-0">
                    <td className="px-3 py-2 align-top"><StatusChip status={status} /></td>
                    <td className="px-3 py-2 align-top text-ink-soft">
                      {def.brokenHop === null ? "—" : HOP_LABELS[def.brokenHop]}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-soft">
                      {def.owner === null ? "—" : OWNER_LABELS[def.owner]}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-soft">{def.means}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="glyphs"
        title="Why every status carries a glyph"
        intro="In dark mode the fifteen pairwise contrasts between the six status grounds sit between 1.01:1 and 1.10:1. Colour alone does not distinguish them — for anyone, not only for colour-blind users. The glyph carries the meaning and the colour agrees with it, so StatusChip has no prop to turn it off."
      >
        <ul className="flex flex-wrap gap-4">
          {GATE_TOKENS.map((token) => (
            <li key={token} className="flex items-center gap-2 font-mono text-xs text-ink-soft">
              <span className="text-base text-ink" aria-hidden="true">{GATE_GLYPHS[token]}</span>
              {token}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="hops"
        title="The six hops"
        intro="A lane is Key → Access → Binding → SAP metadata → SAP data read → App. A hop after the break is 'not reached', never 'failed' and never 'passed' — marking it failed would blame five systems for one failure, and marking it passed would claim we proved something we never attempted."
      >
        <div className="flex flex-col gap-4">
          <Specimen label="hopsFromBreak(null) — nothing broken">
            <GateStrip hops={hopsFromBreak(null)} checkedAt="2 m ago" />
          </Specimen>
          {LANE_HOPS.map((hop) => (
            <Specimen key={hop} label={`hopsFromBreak("${hop}")`}>
              <GateStrip hops={hopsFromBreak(hop)} />
            </Specimen>
          ))}
          <Specimen label="dense — the A S K T summary used in table rows">
            <GateStrip hops={hopsFromBreak("binding")} checkedAt="9 m ago" dense />
          </Specimen>
        </div>
      </Section>

      {/* ── Components ─────────────────────────────────────────────────── */}
      <Section
        id="lanecard"
        title="LaneCard"
        intro="One app × one data feed × one environment. The SAP system is named on the card rather than hidden behind it: 'Test' is not an address, and a lane reading from the wrong Test system fails in a way no status can show."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <LaneCard env="Sandbox" system="S4H-SBX-01" status="live" facts={{ rows: 5, checkedAgo: "2 m ago" }} />
          <LaneCard env="Dev" system="S4H-DEV-02" status="noData" facts={{ checkedAgo: "4 m ago" }} />
          <LaneCard env="Test" system="S4H-TST-01" status="inReview" facts={{ reviewer: "Nadia", waitingFor: "2 h" }} />
          <LaneCard env="Prod" system={null} status="noSapSystem" />
        </div>
      </Section>

      <Section
        id="detail-lines"
        title="The line under each chip"
        intro="From A6's lane-state table where it has one, and from the handoff's Means column where it does not. Rendered here with no facts at all, because a trace is shown at the moment something broke — exactly when a value is most likely missing. None of these may read 'undefined'."
      >
        <ul className="flex flex-col gap-1 text-sm">
          {LANE_STATUSES.map((status) => (
            <li key={status} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-ink-muted">{chipTextFor(status)}</span>
              <span className="text-ink-soft">{LANE_DETAIL[status]({}) ?? "— (chip stands alone)"}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="whytrace"
        title="WhyTrace"
        intro="Every refusal routes to its fix. The correlation id is not decoration — it is what lets someone quote this exact failure to support, and what lets support find it in 30 days of audit without asking for a screenshot."
      >
        <div className="flex flex-col gap-4">
          {(Object.keys(WHY_CASE_HOP) as WhyCase[]).map((c) => (
            <Specimen key={c} label={`whyExplanation("${c}") — ${OWNER_LABELS[whyExplanation(c).owner]}`}>
              <WhyTrace
                whyCase={c}
                facts={{ env: "Test", date: "9 Mar 2027", dataset: "Purchase orders", system: "S4H-TST-01", seconds: 42 }}
                hops={hopsFromBreak(WHY_CASE_HOP[c])}
                brokenAt={WHY_CASE_HOP[c]}
                correlationId={`ce-demo-${c}`}
              />
            </Specimen>
          ))}
        </div>
      </Section>

      <Section
        id="decisionbar"
        title="DecisionBar — and the disabled contract"
        intro="A disabled control keeps its reason as a sibling string, never a title attribute, and keeps its tab stop. Tab into the second example: the button is still focusable, aria-disabled, and its reason is announced. The disabled attribute would remove it from the tab order, so a keyboard user would pass the thing they cannot use and never learn why."
      >
        <div className="flex flex-col gap-4">
          <Specimen label="reviewer — every action available">
            <DecisionBar
              idPrefix="ds-reviewer"
              primary={{ label: ACTIONS.approve.button }}
              narrower={[
                { label: ACTIONS.approveSandboxOnly.button },
                { label: ACTIONS.approveReadOnly.button },
                { label: ACTIONS.requestChanges.button },
              ]}
              destructive={{ label: ACTIONS.reject.button }}
            />
          </Specimen>
          <Specimen label="every disabled reason in A6">
            <div className="flex flex-col gap-4">
              {Object.entries(DISABLED_REASONS).map(([key, reason]) => (
                <DecisionBar
                  key={key}
                  idPrefix={`ds-${key}`}
                  primary={{ label: ACTIONS.approve.button, disabledReason: reason }}
                />
              ))}
            </div>
          </Specimen>
        </div>
      </Section>

      <Section
        id="maskedkey"
        title="MaskedKey"
        intro="A reference, never a key. There is no reveal prop and no code path that renders a whole key — the value is typed as its two halves, so a caller cannot hand this component a secret even by mistake. The one-time reveal at creation is a different surface with a different guarantee behind it."
      >
        <Specimen label='prefix + last four'>
          <div className="flex flex-col gap-3">
            <MaskedKey prefix="ce_live" tail="9Gu4" label="Sandbox key" />
            <MaskedKey prefix="ce_test" tail="a71Q" copyable />
          </div>
        </Specimen>
      </Section>

      <Section
        id="checklist"
        title="CheckList"
        intro="Only a failing check names an owner. A passing one has nobody to chase, and printing a name beside it invites the reader to chase them anyway."
      >
        <CheckList
          caption="Review checks"
          checks={[
            { state: "pass", title: "A colleague raised this", detail: "Requested by Ikmal" },
            { state: "pass", title: "End date set", detail: "9 Mar 2027" },
            { state: "fail", title: "Prod SAP system connected", detail: DISABLED_REASONS.noProdSystem, owner: "platformAdmin" },
            { state: "running", title: "Write checklist confirmed" },
            { state: "skipped", title: "Not applicable to read-only access" },
          ]}
        />
      </Section>

      <Section
        id="needsyou"
        title="NeedsYouRow"
        intro="'Waiting on you' and 'waiting on someone else' are different rows on the same screen. Rendering them alike is how a home screen becomes a list nobody reads. The four-pixel edge only agrees with the title — it never carries the meaning alone."
      >
        <div className="flex flex-col gap-2">
          <NeedsYouRow accent="action" title="Purchase orders · Test needs your approval" detail="Requested by Ikmal · 2 h ago" chips={<StatusChip status="inReview" />} />
          <NeedsYouRow accent="blocked" title="Invoices · Prod is waiting on a platform admin" detail={DISABLED_REASONS.noProdSystem} chips={<StatusChip status="noSapSystem" />} />
          <NeedsYouRow accent="info" title="Suppliers · Dev returned no records" detail="SAP answered successfully and had nothing to return." chips={<StatusChip status="noData" age="4 m ago" />} />
        </div>
      </Section>

      <Section
        id="fieldpicker"
        title="FieldPicker"
        intro="Choosing fields is a privacy decision as much as a technical one, so the count is stated rather than implied. Read-only is a different render, not a disabled form — showing approved fields as greyed-out inputs invites the reader to try to change them."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Specimen label="editable">
            <FieldPicker id="ds-fields" fields={SAMPLE_FIELDS} chosen={chosen} onChange={setChosen} />
          </Specimen>
          <Specimen label="read-only summary">
            <FieldPicker id="ds-fields-ro" fields={SAMPLE_FIELDS} chosen={chosen} readOnly />
          </Specimen>
        </div>
      </Section>

      <Section
        id="opstable"
        title="OpsTable"
        intro="Empty and loading are different and are rendered differently. 'No lanes match this filter' is a fact about the filter; a skeleton is a fact about us. Collapsing them is how an operator concludes the estate is empty during an outage."
      >
        <div className="flex flex-col gap-6">
          <OpsTable
            caption="Every lane"
            legend={<span>Glyphs: {GATE_TOKENS.map((t) => `${GATE_GLYPHS[t]} ${t}`).join(" · ")}</span>}
            rowKey={(r) => r.lane}
            rows={[
              { lane: "Purchase orders · Test", system: "S4H-TST-01", status: "live" as const, rows: 5 },
              { lane: "Invoices · Prod", system: "—", status: "noSapSystem" as const, rows: 0 },
              { lane: "Suppliers · Dev", system: "S4H-DEV-02", status: "noData" as const, rows: 0 },
            ]}
            columns={[
              { key: "lane", header: "Lane", cell: (r) => r.lane },
              { key: "system", header: "SAP system", cell: (r) => r.system },
              { key: "status", header: "Status", cell: (r) => <StatusChip status={r.status} /> },
              { key: "rows", header: "Rows", numeric: true, cell: (r) => r.rows },
            ]}
          />
          <Specimen label="empty — a fact about the filter">
            <OpsTable
              caption="No matches"
              legend={<span>{operationsAllHealthy(11, 15)}</span>}
              rowKey={() => ""}
              rows={[]}
              columns={[{ key: "lane", header: "Lane", cell: () => null }]}
              empty={<p className="text-sm text-ink-soft">{EMPTY_STATES.requestsNoneWaiting.message}</p>}
            />
          </Specimen>
          <Specimen label="loading — a fact about us, and only where nothing has ever loaded">
            <OpsTable
              caption="Loading"
              legend={<span>—</span>}
              rowKey={() => ""}
              rows={[]}
              columns={[{ key: "lane", header: "Lane", cell: () => null }]}
              loading={<SkeletonRow lines={3} widths={["60%", "80%", "45%"]} />}
            />
          </Specimen>
        </div>
      </Section>

      <Section
        id="skeleton"
        title="SkeletonRow and KeepLastKnown"
        intro="Loading never blanks a known state. A lane that was Live two seconds ago is still Live while its re-check runs — replacing it with a pulsing bar throws away the only information the user had and gives nothing back. The skeleton is for what has never loaded."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Specimen label="never loaded → skeleton">
            <KeepLastKnown<string>
              value={undefined}
              lastKnown={undefined}
              fallback={<SkeletonRow lines={2} widths={["70%", "40%"]} />}
            >
              {(v) => <span>{v}</span>}
            </KeepLastKnown>
          </Specimen>
          <Specimen label="refreshing → the last known value, dimmed">
            <KeepLastKnown<string>
              value={undefined}
              lastKnown="5 rows · checked 2 m ago"
              fallback={<SkeletonRow />}
            >
              {(v, stale) => (
                <span className="text-sm text-ink">
                  {v}
                  {stale ? " (re-checking)" : ""}
                </span>
              )}
            </KeepLastKnown>
          </Specimen>
        </div>
      </Section>

      <Section
        id="confirm"
        title="ConfirmDialog"
        intro="It states the impact before it asks. A6's deactivation dialog lists the lanes that will stop reading by name, because '4 lanes' is a number and 'Purchase orders · Test' is a consequence. The confirm button stays focusable while blocked, so the reason can be reached."
      >
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setDialogOpen((o) => !o)}
            className="self-start rounded-[var(--radius-input)] border border-[color:var(--border-default)] px-4 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
          >
            {dialogOpen ? "Hide" : "Show"} the revoke dialog
          </button>
          <ConfirmDialog
            id="ds-revoke"
            open={dialogOpen}
            tone="terminal"
            copy={CONFIRMATIONS.revokeKey}
            impact={["Purchase orders · Test", "Invoices · Test"]}
            onConfirm={() => setDialogOpen(false)}
            onCancel={() => setDialogOpen(false)}
          />
          <Specimen label="deactivate — the impact list is built from the real lanes">
            <ConfirmDialog
              id="ds-deactivate"
              open
              tone="reversible"
              copy={deactivateSapSystemConfirm(["Purchase orders · Test", "Invoices · Test"])}
              impact={["Purchase orders · Test", "Invoices · Test"]}
              onConfirm={() => undefined}
              onCancel={() => undefined}
            />
          </Specimen>
        </div>
      </Section>

      <Section
        id="rail"
        title="Rail and TabBar"
        intro="All six places, always, for everyone. Role changes the actions inside, never the rail — a rail that hides what you cannot do leaves you unable to find out that it exists, or who to ask. Badge counts are one of exactly three things permitted to update optimistically."
      >
        <div className="flex flex-col gap-4">
          <Specimen label="desktop rail">
            <Rail places={RAIL_PLACES} current="/coreedge/requests" badges={{ "/coreedge/requests": 3 }} />
          </Specimen>
          <Specimen label="phone tab bar">
            <Rail places={RAIL_PLACES} current="/coreedge" badges={{ "/coreedge/requests": 3 }} variant="tabbar" />
          </Specimen>
        </div>
      </Section>

      <Section
        id="commandbar"
        title="CommandBar"
        intro="The only thing echoed instantly is the text you typed — which is yours, and not a claim about the system. 'Nothing matches that' and a list of results are different answers; a search that renders nothing for both leaves you unsure whether it worked."
      >
        <CommandBar
          onQuery={setQuery}
          {...(query.trim() === ""
            ? {}
            : {
                results: [
                  { href: "/coreedge/apps/orders", label: "Purchase orders · Test", detail: "S4H-TST-01 · live" },
                ],
              })}
        />
      </Section>

      <Section
        id="app-statuses"
        title="App statuses are not lane statuses"
        intro="Restricted is an app status and never a nineteenth lane status: no new access can be requested or approved, and existing lanes keep serving with their own statuses. AppStatusChip is a separate component rather than a variant, because a shared component with a union prop is how that distinction gets lost."
      >
        <ul className="flex flex-wrap gap-4">
          {APP_STATUSES.map((s) => (
            <li key={s} className="flex flex-col gap-1">
              <AppStatusChip status={s} />
              <span className="max-w-[24ch] text-xs text-ink-muted">{APP_STATUS_VOCABULARY[s].means}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="literals"
        title={`The ${STATUS_LITERAL_MAP.length} literal mappings`}
        intro="Every status literal the codebase already speaks, and what this console does with it. A mapping to nothing is a decision, not a gap — a third of these are environments, operations, audit action names or severity words, and forcing them onto a lane status would print a false claim on a chip."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Every status literal, and what this console does with it</caption>
            <thead>
              <tr className="bg-cream text-left">
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Literal</th>
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Domain</th>
                <th scope="col" className="border-b border-[color:var(--border-default)] px-3 py-2 font-medium text-ink-soft">Becomes</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_LITERAL_MAP.map((m) => (
                <tr key={`${m.domain}-${m.literal}`} className="border-b border-[color:var(--border-default)] last:border-b-0">
                  <td className="px-3 py-2 align-top font-mono text-xs text-ink">{m.literal}</td>
                  <td className="px-3 py-2 align-top font-mono text-xs text-ink-muted">{m.domain}</td>
                  <td className="px-3 py-2 align-top">
                    {m.lane === null ? (
                      <span className="text-xs text-ink-muted">
                        {m.note.startsWith("GAP") ? "no chip fits — see note" : "not a lane chip"}
                      </span>
                    ) : (
                      <StatusChip status={m.lane} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
