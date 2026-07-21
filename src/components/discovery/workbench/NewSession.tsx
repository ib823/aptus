/**
 * ABeam Workbench — C7 new-session setup form.
 *
 * The engagement-setup form (10): name the client, scope the value streams,
 * invite reviewers, then Launch. Streams follow the same pill multi-select as
 * the [id] setup surface; empty = all 10. Reviewers follow the Affirm S9 grant
 * pattern — on launch each gets a one-time invite URL surfaced exactly once
 * (`/d/{token}`), which is why the success state lists them rather than
 * redirecting straight through when there are invites to hand out.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StreamOption {
  id: string;
  name: string;
  processCount: number;
}

interface ReviewerDraft {
  email: string;
  displayName: string;
  roleLabel: string;
}

interface Invite {
  email: string;
  displayName: string;
  inviteUrl: string;
}

export interface NewSessionProps {
  streams: StreamOption[];
}

const ERROR_COPY = {
  bad_client: "Give the engagement a client name.",
  bad_scope: "One of the selected streams is not recognised.",
  bad_reviewer: "Check each reviewer has a valid email and a name.",
  duplicate_reviewer: "Two reviewers share an email — each address can appear once.",
  too_many_reviewers: "That is more reviewers than a session supports.",
  bad_request: "Something in the form was rejected. Check the fields and try again.",
} as const;

/** Map an API error code to copy, always resolving to a definite string. */
function errorCopy(code: string): string {
  return (ERROR_COPY as Record<string, string>)[code] ?? ERROR_COPY.bad_request;
}

function emptyReviewer(): ReviewerDraft {
  return { email: "", displayName: "", roleLabel: "" };
}

export function NewSession({ streams }: NewSessionProps) {
  const router = useRouter();
  const [client, setClient] = useState("");
  const [scope, setScope] = useState<string[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const scopedCount =
    scope.length === 0
      ? streams.reduce((n, s) => n + s.processCount, 0)
      : streams.filter((s) => scope.includes(s.id)).reduce((n, s) => n + s.processCount, 0);

  function toggle(id: string) {
    setScope((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));
  }

  function updateReviewer(index: number, patch: Partial<ReviewerDraft>) {
    setReviewers((cur) => cur.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function launch() {
    setError("");
    const trimmedClient = client.trim();
    if (!trimmedClient) {
      setError(ERROR_COPY.bad_client);
      return;
    }
    // Drop blank reviewer rows — a half-typed row shouldn't block launch.
    const filledReviewers = reviewers
      .map((r) => ({ email: r.email.trim(), displayName: r.displayName.trim(), roleLabel: r.roleLabel.trim() }))
      .filter((r) => r.email !== "" || r.displayName !== "");

    setBusy(true);
    try {
      const res = await fetch("/api/discovery/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: trimmedClient,
          valueStreamIds: scope,
          reviewers: filledReviewers.map((r) => ({
            email: r.email,
            displayName: r.displayName,
            roleLabel: r.roleLabel || null,
          })),
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== "object") {
        const code = data && typeof data === "object" ? String((data as Record<string, unknown>).error ?? "") : "";
        setError(errorCopy(code));
        return;
      }
      const payload = data as { id: string; invites?: Invite[] };
      if (payload.invites && payload.invites.length > 0) {
        // Surface the one-time invite links, then let the consultant move on.
        setCreatedId(payload.id);
        setInvites(payload.invites);
      } else {
        router.push(`/discovery/sessions/${payload.id}`);
      }
    } catch {
      setError("Could not create the session. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Success: hand out the one-time invite links ──────────────────────────
  if (invites && createdId) {
    return (
      <section aria-live="polite">
        <div className="mb-4 rounded-input border border-decision-standard/30 bg-decision-standard/5 px-4 py-3 text-[13px] text-ink">
          Session created. Copy each invite link now — they are shown once and never again.
        </div>
        <ul className="mb-6 divide-y divide-ink-tint overflow-hidden rounded-input border border-border-default bg-paper">
          {invites.map((inv) => (
            <li key={inv.email} className="flex flex-col gap-1 px-4 py-3">
              <span className="text-xs font-semibold text-ink">
                {inv.displayName} <span className="font-normal text-ink-soft">· {inv.email}</span>
              </span>
              <code className="block overflow-x-auto rounded-input bg-ink-tint px-2 py-1 font-mono text-[11px] text-ink-soft">
                {inv.inviteUrl}
              </code>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.push(`/discovery/sessions/${createdId}`)}
          className="flex h-[34px] items-center rounded-input bg-cta px-3.5 text-xs font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          Go to session
        </button>
      </section>
    );
  }

  // ── The setup form ───────────────────────────────────────────────────────
  return (
    <div>
      <section className="mb-6">
        <label htmlFor="new-session-client" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          Client
        </label>
        <input
          id="new-session-client"
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          maxLength={120}
          placeholder="e.g. Northwind Manufacturing"
          className="h-10 w-full max-w-[420px] rounded-input border border-border-default bg-paper px-3 text-sm text-ink placeholder:text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
        />
        <p className="mt-1.5 text-xs text-ink-soft">
          A label for this engagement — no client record is created before onboarding.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          Value-stream scope
        </h2>
        <p className="mb-2.5 text-xs text-ink-soft">
          {scope.length === 0
            ? "No streams selected — the client sees all 10."
            : `${scope.length} of 10 selected — the client sees only these.`}
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

      <section className="mb-6">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          Reviewers <span className="font-normal normal-case text-ink-soft">(optional — invite the client&apos;s people)</span>
        </h2>
        {reviewers.length > 0 && (
          <ul className="mb-2.5 space-y-2">
            {reviewers.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  aria-label={`Reviewer ${i + 1} email`}
                  value={r.email}
                  onChange={(e) => updateReviewer(i, { email: e.target.value })}
                  placeholder="email@client.com"
                  className="h-9 w-[220px] rounded-input border border-border-default bg-paper px-3 text-[13px] text-ink placeholder:text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                />
                <input
                  type="text"
                  aria-label={`Reviewer ${i + 1} name`}
                  value={r.displayName}
                  onChange={(e) => updateReviewer(i, { displayName: e.target.value })}
                  placeholder="Full name"
                  className="h-9 w-[170px] rounded-input border border-border-default bg-paper px-3 text-[13px] text-ink placeholder:text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                />
                <input
                  type="text"
                  aria-label={`Reviewer ${i + 1} role`}
                  value={r.roleLabel}
                  onChange={(e) => updateReviewer(i, { roleLabel: e.target.value })}
                  placeholder="Role (optional)"
                  className="h-9 w-[150px] rounded-input border border-border-default bg-paper px-3 text-[13px] text-ink placeholder:text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setReviewers((cur) => cur.filter((_, idx) => idx !== i))}
                  className="h-9 rounded-input border border-border-default px-2.5 text-[11px] font-semibold text-ink-soft focus-visible:shadow-focus-ring focus-visible:outline-none"
                >
                  Remove<span className="sr-only"> reviewer {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setReviewers((cur) => [...cur, emptyReviewer()])}
          className="h-8 rounded-input border border-border-default px-3 text-xs font-semibold text-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          + Add reviewer
        </button>
      </section>

      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-decision-custom">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void launch()}
        className="flex h-[38px] items-center rounded-input bg-cta px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:shadow-focus-ring focus-visible:outline-none"
      >
        {busy ? "Launching…" : "Launch session"}
      </button>
    </div>
  );
}
