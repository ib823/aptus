import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDevLoginEnabled, TEST_USERS } from "@/lib/auth/dev-login";
import { DevLoginForm } from "./DevLoginForm";

export const metadata: Metadata = { title: "Dev Login" };
export const dynamic = "force-dynamic";

export default function DevLoginPage() {
  if (!isDevLoginEnabled()) {
    notFound();
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Dev Login</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Internal-testing bypass for the magic-link flow. Pick a role to sign in
        as. Real production users are not accessible from this page.
      </p>
      <DevLoginForm users={TEST_USERS} />
    </div>
  );
}
