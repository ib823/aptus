"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";

import { useVerb } from "./useVerb";

/**
 * "Claim this instance" — present the bootstrap token and become its first
 * platform admin (roadmap P0.13, lib/auth/bootstrap.ts).
 *
 * A CLIENT ISLAND, AND ONLY THE FORM. The screen decides whether there is
 * anything to claim; the route decides again, with the token, and audits every
 * attempt. The token is typed into a password field, sent once, and never
 * kept: it is cleared from the field whatever the answer.
 */

const INPUT =
  "rounded-[var(--radius-input)] border border-[color:var(--border-strong)] bg-paper px-3 py-2 font-mono text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy";

export function ClaimInstance(): ReactNode {
  const router = useRouter();
  const onDone = useCallback(() => router.refresh(), [router]);
  const verb = useVerb<{ role: string }>("/api/auth/bootstrap-admin", onDone);
  const [token, setToken] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verb.pending || token.trim() === "") return;
    verb.run({ token });
    setToken("");
  };

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3" aria-labelledby="claim-instance-heading">
      <h2 id="claim-instance-heading" className="text-base font-medium text-ink">
        Claim this instance
      </h2>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Bootstrap token
        <input
          type="password"
          name="token"
          required
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={INPUT}
        />
      </label>
      <span className="flex flex-col items-start gap-1">
        <button
          type="submit"
          aria-busy={verb.pending}
          className="rounded-[var(--radius-input)] bg-navy px-4 py-2 text-sm font-medium text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy"
        >
          Become platform administrator
        </button>
      </span>
      {verb.error === null ? null : (
        <p role="status" className="text-sm text-gate-bad-fg">
          {verb.error}
        </p>
      )}
      {verb.data === null ? null : (
        <p role="status" className="text-sm text-ink-soft">
          You are this instance&apos;s platform administrator. The token cannot be used again.
        </p>
      )}
    </form>
  );
}
