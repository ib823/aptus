"use client";

/**
 * "Ask Basis for SAP_COM_xxxx" (roadmap P1.2): which SAP communication
 * scenarios enable a service, from SAP's own table, and a request the builder
 * copies to their Basis team.
 *
 * Every scenario that lists the service is named, because any ONE of them
 * enables it, and each says how many other interfaces it opens: activating a
 * scenario is a least-privilege decision, and the screen keeps it visible.
 * The request is copied to the clipboard and nothing more: no email, no
 * ticket, no credential.
 */

import { useState } from "react";

import { askBasisText, type ScenarioRef } from "@/lib/sap-public/comm-scenarios";

export interface AskBasisData {
  /** The service is not shown as activated here: asking Basis is the next step. Otherwise information. */
  readonly action: boolean;
  readonly scenarios: readonly ScenarioRef[];
  readonly release: string | null;
  readonly source: string;
  readonly technicalId: string;
}

export function AskBasisPanel({
  data,
  serviceLabel,
  connectionLabel,
}: {
  data: AskBasisData;
  serviceLabel?: string | null;
  connectionLabel?: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (scenario: ScenarioRef) => {
    const text = askBasisText({
      scenario,
      service: { technicalId: data.technicalId, label: serviceLabel ?? null },
      connectionLabel: connectionLabel ?? null,
      release: data.release,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(scenario.id);
    } catch {
      setCopied(null);
    }
  };
  if (!data.action) {
    return (
      <p className="text-xs" style={{ color: "var(--ink-secondary)" }} data-testid="ask-basis-info">
        Enabled by{" "}
        {data.scenarios.map((s, i) => (
          <span key={s.id}>
            {i > 0 ? ", " : ""}
            <code>{s.id}</code>
          </span>
        ))}{" "}
        <span style={{ color: "var(--ink-muted)" }}>
          ({data.source}
          {data.release ? `, ${data.release}` : ""})
        </span>
      </p>
    );
  }
  return (
    <section
      aria-label="Ask your Basis team"
      data-testid="ask-basis"
      className="rounded-[var(--radius-input)] px-3 py-2 text-xs"
      style={{ border: "1px solid var(--border-default)", color: "var(--ink-secondary)" }}
    >
      <p className="font-semibold" style={{ color: "var(--ink-primary)" }}>
        Ask Basis for {data.scenarios.length === 1 ? data.scenarios[0]!.id : "one of these communication scenarios"}
      </p>
      <p className="mt-0.5">
        SAP lists <code>{data.technicalId}</code> under {data.scenarios.length === 1 ? "this scenario" : "each of these; any one of them enables it"}.
        A communication arrangement for it, with your communication user, lets CoreEdge call the service.
      </p>
      <ul className="mt-1.5 space-y-1">
        {data.scenarios.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <code className="rounded-[var(--radius-input)] px-1.5 py-0.5" style={{ background: "var(--surface-ink-tint)", color: "var(--ink-primary)" }}>
              {s.id}
            </code>
            {s.name ? <span>{s.name}</span> : null}
            {s.interfaceCount > 1 ? (
              <span style={{ color: "var(--ink-muted)" }}>
                also enables {s.interfaceCount - 1} other interface{s.interfaceCount - 1 === 1 ? "" : "s"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void copy(s)}
              className="rounded-[var(--radius-input)] px-2 py-0.5 font-semibold"
              style={{ border: "1px solid var(--brand-navy)", color: "var(--brand-navy)", background: "var(--surface-paper)" }}
              aria-label={`Copy a request to Basis for ${s.id}`}
            >
              {copied === s.id ? "Copied" : "Copy request"}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5" style={{ color: "var(--ink-muted)" }}>
        Source: {data.source}
        {data.release ? `, release ${data.release}` : ""}. SAP S/4HANA Cloud Public Edition only.
      </p>
    </section>
  );
}
