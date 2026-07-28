"use client";

/**
 * Throttle — remaining budget, read without spending it.
 *
 * TWO KINDS OF BUCKET AND THEY ARE NOT COMPARABLE, so the screen separates them
 * rather than listing four rows that look alike.
 *
 * Per-credential buckets are observable: we know every credential in the tenant,
 * so we can ask each one's headroom, and a 429 on those paths is audited.
 *
 * The IP-keyed middleware buckets fire before the route, persist nothing, and
 * are keyed by an address we cannot enumerate. Their limit is knowable; their
 * usage is not, ever. They render with an em-dash where a figure would go —
 * never a zero, never a spinner, never a bar at 100%. Showing a usage number for
 * them would be a fabrication, and a particularly convincing one because it
 * would sit beside real figures in the same layout.
 */

import {
  OpsCard,
  OpsChip,
  OpsHeading,
  OpsPlaceholder,
  OpsTable,
  ProvenanceStrip,
  Unobservable,
  opsCellStyle,
  opsMonoStyle,
} from "@/components/ops/OpsChrome";
import { count, useOpsFeed } from "@/components/ops/useOpsFeed";

interface Bucket {
  id: string;
  key: string;
  keyedBy: "client IP" | "credential";
  limit: number;
  windowMs: number;
  observable: boolean;
  note: string;
}

interface Budget {
  known: boolean;
  remaining: number | null;
  limit: number;
}

interface CredentialBudget {
  clientId: string;
  solutionId: string;
  label: string;
  environment: string;
  read: Budget;
  write: Budget;
  throttledInWindow: number;
}

interface ThrottlePayload {
  windowHours: number;
  buckets: Bucket[];
  credentials: CredentialBudget[];
  provenance: {
    nonConsumingRead: boolean;
    why: string;
    edgeBucketsAreNotObservable: string;
    unknownRatherThanZero: string | null;
    backend: "shared" | "in-memory";
    headroomIsPerInstance: boolean;
    backendNote: string;
    throttleCountsAreAFloor: string;
  };
}

export function ThrottleClient() {
  const { feed } = useOpsFeed<ThrottlePayload>("/api/ops/throttle");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <OpsHeading
        title="Throttle"
        lede="How much of each rate-limit budget is left. Reading this page does not spend any of it — the headroom below is queried, never consumed."
      />

      {feed.state === "loading" ? (
        <OpsCard>
          <OpsPlaceholder kind="loading" title="" detail="" />
        </OpsCard>
      ) : feed.state === "error" ? (
        <OpsCard>
          <OpsPlaceholder kind="error" title="Throttle status could not be read" detail={feed.message} />
        </OpsCard>
      ) : (
        <ThrottleBody data={feed.data} />
      )}
    </div>
  );
}

function ThrottleBody({ data }: { data: ThrottlePayload }) {
  const { buckets, credentials, provenance, windowHours } = data;
  const observable = buckets.filter((b) => b.observable);
  const opaque = buckets.filter((b) => !b.observable);

  return (
    <>
      {/* The configuration warning comes first when it is a fault, because it
          changes what every number below means. */}
      {provenance.headroomIsPerInstance ? (
        <OpsCard>
          <div style={{ padding: "13px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ flex: "none", paddingTop: 1 }}>
              <OpsChip tone="attention" label="per instance" meaning="no shared rate-limit backend is configured" />
            </span>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-secondary)" }}>
              {provenance.backendNote}
            </p>
          </div>
        </OpsCard>
      ) : null}

      <OpsCard>
        {credentials.length === 0 ? (
          <OpsPlaceholder
            kind="empty"
            title="No live credential to report a budget for"
            detail="Budgets are per credential. Issue one in Developer Studio and its headroom appears here."
          />
        ) : (
          <OpsTable head={["Credential", "Environment", "Read budget", "Write budget", "429s in window"]}>
            {credentials.map((c) => (
              <tr key={c.clientId}>
                <td style={opsCellStyle}>
                  {c.label}
                  <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                    {c.solutionId}
                  </div>
                </td>
                <td style={opsCellStyle}>
                  <OpsChip
                    tone={c.environment.toUpperCase() === "PROD" ? "attention" : "info"}
                    label={c.environment}
                  />
                </td>
                <td style={opsCellStyle}>
                  <BudgetCell budget={c.read} />
                </td>
                <td style={opsCellStyle}>
                  <BudgetCell budget={c.write} />
                </td>
                <td style={{ ...opsMonoStyle, textAlign: "right" }}>{count(c.throttledInWindow)}</td>
              </tr>
            ))}
          </OpsTable>
        )}

        <ProvenanceStrip claim="Reading this does not spend it">
          {provenance.why}
          {provenance.unknownRatherThanZero ? (
            <div style={{ marginTop: 6 }}>{provenance.unknownRatherThanZero}</div>
          ) : null}
          <div style={{ marginTop: 6 }}>
            {provenance.throttleCountsAreAFloor} Window: last {windowHours} hours.
          </div>
        </ProvenanceStrip>
      </OpsCard>

      <OpsCard>
        <div style={{ padding: "13px 16px 4px", fontSize: 13, fontWeight: 600 }}>
          The buckets a call passes
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 20, padding: "8px 16px 15px" }}>
          {observable.map((b) => (
            <div key={b.id}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-muted)", fontWeight: 600 }}>
                {b.id.replace(/-/g, " ")}
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, margin: "8px 0 2px", fontVariantNumeric: "tabular-nums" }}>
                {count(b.limit)}
                <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-muted)" }}>
                  {" "}
                  / {Math.round(b.windowMs / 1000)}s
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5, color: "var(--ink-muted)" }}>
                per {b.keyedBy}
              </div>
            </div>
          ))}
          {opaque.map((b) => (
            <Unobservable
              key={b.id}
              label={b.id.replace(/-/g, " ")}
              why={`Not observable · limit ${count(b.limit)} per ${b.keyedBy}`}
            />
          ))}
        </div>

        <ProvenanceStrip claim="Two of these can never show usage">
          {provenance.edgeBucketsAreNotObservable}
        </ProvenanceStrip>
      </OpsCard>
    </>
  );
}

/**
 * A budget, or an honest unknown.
 *
 * `known: false` means the shared backend did not answer. That renders as
 * "unknown", never as zero — a zero would read as "this credential is throttled
 * right now", which would be a claim about a customer's traffic invented during
 * our own outage.
 */
function BudgetCell({ budget }: { budget: Budget }) {
  if (!budget.known || budget.remaining === null) {
    return <OpsChip tone="muted" label="unknown" meaning="the rate-limit backend did not answer — not zero" />;
  }
  const spent = budget.limit - budget.remaining;
  const pct = budget.limit > 0 ? Math.round((budget.remaining / budget.limit) * 100) : 0;
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        {count(budget.remaining)} of {count(budget.limit)} left
      </div>
      <div
        role="progressbar"
        aria-valuenow={budget.remaining}
        aria-valuemin={0}
        aria-valuemax={budget.limit}
        aria-label={`${budget.remaining} of ${budget.limit} remaining`}
        style={{ height: 5, borderRadius: 9999, background: "var(--status-expired-bg)", overflow: "hidden", marginTop: 5 }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct < 20 ? "var(--warning)" : "var(--success)",
          }}
        />
      </div>
      {spent > 0 ? (
        <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 3 }}>{count(spent)} used</div>
      ) : null}
    </div>
  );
}
