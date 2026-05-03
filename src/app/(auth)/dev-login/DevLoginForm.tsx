"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TestUser } from "@/lib/auth/dev-login";

interface Props {
  users: readonly TestUser[];
  redirectTo?: string;
}

export function DevLoginForm({ users, redirectTo = "/assessments" }: Props) {
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
        setError(data.error ?? `Login failed (${res.status})`);
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
