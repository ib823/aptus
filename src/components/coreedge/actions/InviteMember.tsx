"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";

import { blockedControlProps, reasonIdFor } from "@/lib/coreedge/disabled";

import { useVerb } from "./useVerb";

/**
 * "Invite a colleague" — the members screen's one verb (roadmap P0.13).
 *
 * A CLIENT ISLAND, AND ONLY THE FORM. The screen stays a server component: it
 * reads the members and decides who may invite and which roles they may offer
 * (lib/auth/org-invites.ts). This owns pressing. The route decides again, so a
 * role list edited in the browser buys nothing.
 *
 * BLOCKED, NOT HIDDEN. Someone who cannot invite still sees the form and the
 * sentence saying why — the console's rule for every control.
 */

export interface InviteMemberProps {
  readonly organizationId: string;
  /** What the inviter may offer, highest first, with display labels. */
  readonly roles: readonly { readonly value: string; readonly label: string }[];
  /** Why inviting is blocked for this person, or null when they may invite. */
  readonly blockedBecause: string | null;
}

const INPUT =
  "rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy";

export function InviteMember({ organizationId, roles, blockedBecause }: InviteMemberProps): ReactNode {
  const router = useRouter();
  const onDone = useCallback(() => router.refresh(), [router]);
  const verb = useVerb<{ invitation: { email: string } }>(`/api/organizations/${organizationId}/users`, onDone);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "");

  const submitId = "invite-member-submit";
  const reasonId = reasonIdFor(submitId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blockedBecause !== null || verb.pending) return;
    verb.run({ email, role });
  };

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3" aria-labelledby="invite-member-heading">
      <h2 id="invite-member-heading" className="text-base font-medium text-ink">
        Invite a colleague
      </h2>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Email address
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Role
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={INPUT}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <span className="flex flex-col items-start gap-1">
        {blockedBecause === null ? (
          <button
            id={submitId}
            type="submit"
            aria-busy={verb.pending}
            className="rounded-[var(--radius-input)] bg-navy px-4 py-2 text-sm font-medium text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
          >
            Send invitation
          </button>
        ) : (
          <>
            <button
              id={submitId}
              type="button"
              {...blockedControlProps(reasonId)}
              className="cursor-not-allowed rounded-[var(--radius-input)] border border-[color:var(--border-default)] px-4 py-2 text-sm text-ink-disabled"
            >
              Send invitation
            </button>
            <span id={reasonId} className="text-xs text-ink-muted">
              {blockedBecause}
            </span>
          </>
        )}
      </span>
      {verb.error === null ? null : (
        <p role="status" className="text-sm text-gate-bad-fg">
          {verb.error}
        </p>
      )}
      {verb.data === null ? null : (
        <p role="status" className="text-sm text-ink-soft">
          Invitation sent to {verb.data.invitation.email}. It lasts seven days.
        </p>
      )}
    </form>
  );
}
