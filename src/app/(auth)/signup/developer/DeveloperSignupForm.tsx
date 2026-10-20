"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The developer workspace sign-up form (roadmap P0.13). One field: the address
 * the sign-in link goes to. Nothing exists until that link is clicked — the
 * workspace is created then — so the form promises an email, not an account.
 */
export function DeveloperSignupForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: "developer", email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Sign-up failed. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <CheckCircle className="mb-4 h-12 w-12 text-green-600 dark:text-green-400" aria-hidden="true" />
        <h2 className="mb-2 text-xl font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          If that address can sign up, a sign-in link is on its way. Your workspace is created when you
          click it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <div>
        <label htmlFor="developer-email" className="mb-1 block text-sm font-medium">
          Work email
        </label>
        <div className="relative">
          <Mail
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="developer-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="h-11 pl-10"
          />
        </div>
      </div>
      <Button type="submit" className="h-11 w-full" disabled={loading}>
        {loading ? "Sending link..." : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
