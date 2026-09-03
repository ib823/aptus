import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDevLoginEnabled, TEST_USERS } from "@/lib/auth/dev-login";
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

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Dev Login</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Internal-testing bypass for the magic-link flow. Pick a role to sign in
        as. Real production users are not accessible from this page.
      </p>
      <DevLoginForm users={TEST_USERS} redirectTo={redirectTo} />
    </div>
  );
}
