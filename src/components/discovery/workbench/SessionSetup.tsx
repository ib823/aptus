/**
 * ABeam Workbench — C7 session setup: scope + reviewer grants.
 *
 * Scope is a multi-select of the 10 streams. Empty = all — the same convention
 * as the grants, and the UI says so rather than leaving the reader to guess
 * whether "nothing selected" means "nothing" or "everything".
 *
 * The reviewer table follows the Affirm S9 grants pattern; status is DERIVED
 * from the grant's lifecycle (revoked → superseded → verified → acknowledged →
 * invited). The .dc hardcodes three statuses onto three invented people.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewerRow, SessionSummary } from "@/lib/discovery/workbench/session";

const STATUS_PILL: Record<ReviewerRow["status"], string> = {
  invited: "bg-status-sent-bg text-status-sent-fg",
  acknowledged: "bg-status-awaiting-bg text-status-awaiting-fg",
  verified: "bg-status-signed-bg text-status-signed-fg",
  revoked: "bg-status-revoked-bg text-status-revoked-fg",
  superseded: "bg-status-expired-bg text-status-expired-fg",
};

const STATUS_LABEL: Record<ReviewerRow["status"], string> = {
  invited: "Invited",
  acknowledged: "Acknowledged",
  verified: "Verified",
  revoked: "Revoked",
  superseded: "Superseded",
};

export interface SessionSetupProps {
  session: SessionSummary;
  streams: Array<{ id: string; name: string; processCount: number }>;
}

export function SessionSetup({ session, streams }: SessionSetupProps) {
  const router = useRouter();
  const [scope, setScope] = useState<string[]>(session.scopedStreamIds);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const scopedCount = scope.length === 0
    ? streams.reduce((n, s) => n + s.processCount, 0)
    : streams.filter((s) => scope.includes(s.id)).reduce((n, s) => n + s.processCount, 0);

  async function saveScope(next: string[]) {
    setBusy(true);
    try {
      const res = await fetch(`/api/discovery/sessions/${session.id}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scope", valueStreamIds: next }),
      });
      setStatus(res.ok ? "Scope saved" : "Could not save the scope.");
      router.refresh();
    } catch {
      setStatus("Could not save the scope.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    const next = scope.includes(id) ? scope.filter((s) => s !== id) : [...scope, id];
    setScope(next);
    void saveScope(next);
  }

  async function grantAction(action: "revoke" | "resend", grantId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/discovery/sessions/${session.id}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, grantId }),
      });
      setStatus(res.ok ? "Done" : "Could not do that.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          Value-stream scope
        </h2>
        <p className="mb-2.5 text-xs text-ink-soft">
          {scope.length === 0
            ? "No streams selected — the client sees all 10."
            : `${scope.length} of 10 selected — the client sees only these. Reviewers scoped to a stream outside this list see nothing from it.`}
        </p>
        <ul className="flex flex-wrap gap-2">
          {streams.map((s) => {
            const on = scope.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={`flex h-8 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold focus-visible:shadow-focus-ring focus-visible:outline-none ${
                    on ? "border-navy bg-navy text-white" : "border-border-default bg-paper text-ink-soft"
                  }`}
                >
                  {s.name}
                  <span className={on ? "text-white/70" : "text-ink-soft"}>{s.processCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 font-mono text-[11px] text-ink-soft" aria-live="polite">
          {scopedCount} processes in scope
        </p>
      </section>

      <section>
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          Reviewers
        </h2>
        {session.reviewers.length === 0 ? (
          <p className="rounded-input border border-border-default bg-paper px-6 py-8 text-center text-[13px] text-ink-soft">
            No reviewers invited yet.
          </p>
        ) : (
          <div className="overflow-auto rounded-input border border-border-default bg-paper">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">Reviewers invited to this session, and their access status.</caption>
              <thead className="bg-ink-tint">
                <tr>
                  {["Name", "Email", "Role", "Scope", "Status", "Last access", "Actions"].map((h) => (
                    <th key={h} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {session.reviewers.map((r) => (
                  <tr key={r.id} className="border-b border-ink-tint">
                    <th scope="row" className="px-3.5 py-3 text-xs font-semibold text-ink">{r.displayName}</th>
                    <td className="px-3.5 py-3 font-mono text-[11px] text-ink-soft">{r.email}</td>
                    <td className="px-3.5 py-3 text-[11px] text-ink-soft">{r.roleLabel ?? "—"}</td>
                    <td className="px-3.5 py-3 text-[11px] text-ink-soft">
                      {r.streamIds.length === 0 ? "Session scope" : `${r.streamIds.length} streams`}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={`inline-flex h-5 items-center rounded-pill px-2 text-[10px] font-bold uppercase ${STATUS_PILL[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-ink-soft">
                      {r.lastAccessAt ? r.lastAccessAt.toISOString().slice(0, 10) : "Never"}
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={busy || r.status === "revoked"}
                          onClick={() => void grantAction("resend", r.id)}
                          className="h-7 rounded-input border border-border-default px-2 text-[11px] font-semibold text-ink-soft disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          disabled={busy || r.status === "revoked"}
                          onClick={() => void grantAction("revoke", r.id)}
                          className="h-7 rounded-input border border-border-default px-2 text-[11px] font-semibold text-status-revoked-fg disabled:opacity-40 focus-visible:shadow-focus-ring focus-visible:outline-none"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p aria-live="polite" className="mt-2 min-h-[16px] text-[11px] text-ink-soft">{status}</p>
      </section>
    </>
  );
}
