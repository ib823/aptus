import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { devLoginBlocker, isDevLoginEnabled, TEST_USERS } from "@/lib/auth/dev-login";
import { safeRelativePath } from "@/lib/http/safe-relative-path";
import { DevLoginForm } from "./DevLoginForm";

export const metadata: Metadata = { title: "Dev Login" };
export const dynamic = "force-dynamic";

// On a Workbench-only deployment the Aptus portal (/assessments) is not
// reachable, so testers must land on the Workbench home instead.
const DEFAULT_LANDING =
  process.env.WORKBENCH_ONLY === "true" ? "/workbench" : "/assessments";

function safeCallbackUrl(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Same-origin paths only — the shared sanitizer, so this page cannot drift
  // from the rule the auth callbacks enforce.
  return safeRelativePath(value, DEFAULT_LANDING);
}

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  if (!isDevLoginEnabled()) {
    notFound();
  }

  const { callbackUrl } = await searchParams;
  const redirectTo = safeCallbackUrl(callbackUrl);

  // The endpoint's remaining two gates, evaluated here so a refusal is
  // explained BEFORE anyone types a secret that was never going to be read.
  const blocker = devLoginBlocker(await headers());

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Dev Login</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Internal-testing bypass for the magic-link flow. Pick a role to sign in
        as. Real production users are not accessible from this page.
      </p>

      {blocker && (
        <div
          role="alert"
          className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-medium">{blocker.title}</p>
          <p className="mt-1.5">{blocker.detail}</p>
          <p className="mt-2">
            <span className="font-medium">To fix: </span>
            {blocker.fix}
          </p>
          <p className="mt-2 text-xs opacity-80">
            The buttons below still work — this is what the server predicts, not a
            refusal from this page.
          </p>
        </div>
      )}

      <DevLoginForm
        users={TEST_USERS}
        redirectTo={redirectTo}
        knownBlocker={blocker?.code ?? null}
      />
    </div>
  );
}
