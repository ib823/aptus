"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TestUser } from "@/lib/auth/dev-login";

interface Props {
  users: readonly TestUser[];
  redirectTo?: string;
  /**
   * The gate the server already knows will refuse this caller, if any. Used
   * only to keep the failure message consistent with the banner above the
   * form — the server decides, this just avoids contradicting it.
   */
  knownBlocker?: string | null;
}

/**
 * WHAT A FAILURE ACTUALLY MEANS, WHICH THIS USED TO GET WRONG.
 *
 * The endpoint has two shapes of refusal and they need opposite responses:
 *
 *   403 "Invalid secret"  — the secret was compared and did not match. Retype it.
 *   404 "Not available"   — a gate BEFORE the comparison refused the request.
 *                           Nothing typed here can change the outcome.
 *
 * This rendered `data.error` verbatim, so a 404 surfaced as the words "Not
 * available" directly beneath a password box. Every reader takes that to mean
 * the password was rejected, and on the live deployment three people in a row
 * retyped a secret that was never read. The distinction is the whole message.
 */
function explainFailure(status: number, apiError: string | undefined, knownBlocker: string | null): string {
  if (status === 404) {
    return (
      "Refused before the secret was checked — so this is a deployment setting, not the value you " +
      (knownBlocker
        ? "entered. See the explanation above the form."
        : "entered. Check ENABLE_TEST_LOGIN_ENDPOINT, ALLOW_TEST_LOGIN_IN_PROD and the IP allow-list on this deployment.")
    );
  }
  if (status === 403) {
    return "That secret does not match the one configured on this deployment.";
  }
  return apiError ?? `Login failed (${status})`;
}

export function DevLoginForm({ users, redirectTo = "/assessments", knownBlocker = null }: Props) {
  const [secret, setSecret] = useState("");
  const [loadingFor, setLoadingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function login(user: TestUser): Promise<void> {
    setError(null);
    setLoadingFor(user.email);
    try {
      const res = await fetch("/api/auth/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          email: user.email,
          role: user.role,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(explainFailure(res.status, data.error, knownBlocker));
        setLoadingFor(null);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error");
      setLoadingFor(null);
    }
  }

  const canSubmit = secret.length >= 8 && loadingFor === null;

  return (
    <div className="space-y-4">
      <div>
        <label
          className="block text-sm font-medium mb-1"
          htmlFor="dev-login-secret"
        >
          E2E_TEST_SECRET
        </label>
        <input
          id="dev-login-secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Paste from your team password manager"
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Must match the env var on the server.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <button
            key={u.email}
            type="button"
            onClick={() => login(u)}
            disabled={!canSubmit}
            className="w-full text-left rounded border border-input bg-background hover:bg-muted px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <div className="font-medium">{u.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {u.role} · {u.email}
              {loadingFor === u.email && " · signing in…"}
            </div>
            <div className="text-xs text-muted-foreground/80 mt-1">
              {u.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
