"use client";

/**
 * <GrantsPanel> — consultant grant management for the Affirm external
 * executive journey. Lives on the review screen (issued / submitted bundles).
 *
 * Lists per-executive grants with status + progress, an invite form (email +
 * name + role label + value-stream multi-select scoped to the bundle's
 * streams), and per-grant actions: reissue/resend and revoke. All actions hit
 * /api/affirm/bundles/[id]/grants* and then refresh the list.
 */

import { useState, useTransition } from "react";
import { StatusPill, type PillTone } from "@/components/affirm/external/StatusPill";

export interface GrantClient {
  id: string;
  email: string;
  displayName: string;
  roleLabel: string | null;
  valueStreamIds: string[];
  status: string;
  answered: number;
  total: number;
  expiresAt: string | null;
}

interface StreamOption {
  id: string;
  name: string;
}

interface GrantsPanelProps {
  bundleId: string;
  streams: StreamOption[];
  initialGrants: GrantClient[];
}

const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  invited: { label: "Invited", tone: "invited" },
  acknowledged: { label: "Acknowledged", tone: "acknowledged" },
  verified: { label: "Verified", tone: "verified" },
  in_progress: { label: "In progress", tone: "progress" },
  answered: { label: "Answered", tone: "submitted" },
  submitted: { label: "Submitted", tone: "submitted" },
  locked_out: { label: "Revoked", tone: "revoked" },
  revoked: { label: "Revoked", tone: "revoked" },
  reissued: { label: "Reissued", tone: "neutral" },
  // Lapsed reads like revoked because the link is equally dead; the word
  // differs so the panel still says WHY it ended.
  expired: { label: "Expired", tone: "revoked" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as PillTone };
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

export function GrantsPanel({ bundleId, streams, initialGrants }: GrantsPanelProps) {
  const [grants, setGrants] = useState<GrantClient[]>(initialGrants);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
  /** Blank means the standard 30-day window — never "forever". */
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const res = await fetch(`/api/affirm/bundles/${bundleId}/grants`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { grants: GrantClient[] };
      setGrants(data.grants);
    }
  }

  function toggleStream(id: string) {
    setSelectedStreams((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function invite() {
    setError(null);
    setNotice(null);
    if (!email.trim() || !displayName.trim()) {
      setError("Name and email are required.");
      return;
    }
    /*
     * Scope is chosen, never defaulted. The API used to accept an empty array
     * and every reader reads that as "all streams", so the quiet path was to
     * send an external executive the entire bundle.
     */
    if (selectedStreams.length === 0) {
      setError(
        "Choose at least one value stream. An invite with no streams selected would show this executive the whole bundle.",
      );
      return;
    }
    /*
     * CONFIRM BEFORE AN EXTERNAL EMAIL LEAVES. This sends a named outsider a
     * live link to a client's unreleased Fit-to-Standard decisions, and it was
     * a single unguarded click with no undo — the mail is gone the moment the
     * request lands.
     */
    const scopeText = selectedStreams
      .map((id) => streams.find((s) => s.id === id)?.name ?? id)
      .join(", ");
    const ok = window.confirm(
      `Email an invite to ${displayName.trim()} <${email.trim()}>?\n\n` +
        `They will get access to: ${scopeText}\n` +
        `Access ends: ${expiresAt || "in 30 days"}\n\n` +
        "This sends a real email to an external recipient and cannot be unsent.",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          roleLabel: roleLabel.trim() || null,
          valueStreamIds: selectedStreams,
          // A date input gives a local calendar day; send end-of-day UTC so
          // "expires 12 Aug" does not cut off on the morning of the 12th.
          ...(expiresAt
            ? { expiresAt: new Date(`${expiresAt}T23:59:59Z`).toISOString() }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ? `Could not invite (${body.error}).` : "Could not send the invite.");
        return;
      }
      setEmail("");
      setDisplayName("");
      setRoleLabel("");
      setSelectedStreams([]);
      setExpiresAt("");
      setNotice(`Invite sent to ${email.trim()}.`);
      await refresh();
    });
  }

  function act(grantId: string, action: "revoke" | "reissue") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/grants/${grantId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        setError(`Could not ${action} the grant.`);
        return;
      }
      setNotice(action === "revoke" ? "Access revoked." : "A fresh invite has been sent.");
      await refresh();
    });
  }

  const scopeLabel = (ids: string[]) =>
    ids.length === 0
      ? // Only reachable on grants written before scope became mandatory. Say
        // what it means rather than the neutral-sounding "All streams".
        "All streams (unscoped — pre-dates scope selection)"
      : ids
          .map((id) => streams.find((s) => s.id === id)?.name ?? id)
          .join(", ");

  const canAct = (status: string) => status !== "revoked" && status !== "reissued";

  return (
    <section
      className="mb-6 rounded-card-warm border border-border-default bg-paper p-5 shadow-card"
      data-testid="affirm-grants-panel"
    >
      <div className="mb-4">
        <h2 className="font-serif text-xl text-ink">Executive access</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Invite individual executives to review their process areas. Each gets a personal,
          auditable link scoped to the value streams you choose.
        </p>
      </div>

      {grants.length > 0 ? (
        <ul className="mb-5 divide-y divide-border-default">
          {grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{g.displayName}</span>
                  {g.roleLabel ? (
                    <span className="rounded-pill bg-navy-soft px-2 py-0.5 text-[11px] font-medium text-navy">
                      {g.roleLabel}
                    </span>
                  ) : null}
                  <StatusBadge status={g.status} />
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-muted">
                  {g.email} · {scopeLabel(g.valueStreamIds)} · {g.answered}/{g.total} answered
                  {g.expiresAt ? (
                    <>
                      {" · "}
                      {g.status === "expired" ? "ended " : "ends "}
                      {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                        new Date(g.expiresAt),
                      )}
                    </>
                  ) : (
                    // Pre-dates the expiry column. Naming it is the point: an
                    // unbounded external link is a defect, not a state.
                    <span className="text-cta"> · no expiry recorded</span>
                  )}
                </div>
              </div>
              {canAct(g.status) ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(g.id, "reissue")}
                    className="rounded-input border border-border-default px-2.5 py-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(g.id, "revoke")}
                    className="rounded-input border border-border-default px-2.5 py-1 text-xs font-medium text-cta hover:bg-banner-warn disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-sm text-ink-muted">No executives invited yet.</p>
      )}

      {/* Invite form */}
      <div className="rounded-card-warm border border-border-default bg-cream p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-ink-soft">
            Name <span aria-hidden="true">*</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              name="displayName"
              autoComplete="name"
              className="mt-1 w-full rounded-input border border-border-default bg-paper px-2.5 py-1.5 text-sm text-ink"
              placeholder="Jane Tan"
            />
          </label>
          <label className="text-xs font-medium text-ink-soft">
            Email <span aria-hidden="true">*</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              name="email"
              autoComplete="email"
              className="mt-1 w-full rounded-input border border-border-default bg-paper px-2.5 py-1.5 text-sm text-ink"
              placeholder="jane.tan@company.com"
            />
          </label>
          <label className="text-xs font-medium text-ink-soft">
            Role label (optional)
            <input
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              name="roleLabel"
              autoComplete="organization-title"
              className="mt-1 w-full rounded-input border border-border-default bg-paper px-2.5 py-1.5 text-sm text-ink"
              placeholder="CFO"
            />
          </label>
          <label className="text-xs font-medium text-ink-soft">
            Access ends
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
              max={new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)}
              name="expiresAt"
              className="mt-1 w-full rounded-input border border-border-default bg-paper px-2.5 py-1.5 text-sm text-ink"
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-muted">
              Blank = 30 days. There is no &ldquo;never&rdquo;.
            </span>
          </label>
        </div>

        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-ink-soft">
            Value streams — choose at least one
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {streams.map((s) => {
              const on = selectedStreams.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStream(s.id)}
                  aria-pressed={on}
                  className={`rounded-pill border px-2.5 py-1 text-xs font-medium ${
                    on
                      ? "border-navy bg-navy text-white"
                      : "border-border-default bg-paper text-ink-soft hover:text-ink"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        {error ? <p className="mt-3 text-xs text-cta">{error}</p> : null}
        {notice ? <p className="mt-3 text-xs text-decision-standard">{notice}</p> : null}

        <div className="mt-3">
          <button
            type="button"
            disabled={pending}
            onClick={invite}
            className="rounded-input bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </section>
  );
}
