import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDevLoginEnabled, TEST_USERS } from "@/lib/auth/dev-login";
import { DevLoginForm } from "./DevLoginForm";

export const metadata: Metadata = { title: "Dev Login" };
export const dynamic = "force-dynamic";

function safeCallbackUrl(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "/assessments";
  // Only allow same-origin absolute paths; reject protocol-relative and external URLs.
  if (!value.startsWith("/") || value.startsWith("//")) return "/assessments";
  return value;
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
