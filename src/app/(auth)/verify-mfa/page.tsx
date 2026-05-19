import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isMfaRequired, requiresMfaEnrollment } from "@/lib/auth/permissions";
import { VerifyMfaForm } from "@/components/auth/VerifyMfaForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_NEXT = "/dashboard";

/**
 * Restrict `next` to a same-origin path. We deliberately reject:
 *   - protocol-relative ("//evil.com/x") and absolute URLs (open-redirect)
 *   - anything starting with "/login" or "/verify-mfa" (would create a loop)
 *   - paths whose decoded form contains control chars
 */
function safeNext(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return DEFAULT_NEXT;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_NEXT;
  }

  if (!decoded.startsWith("/")) return DEFAULT_NEXT;
  if (decoded.startsWith("//")) return DEFAULT_NEXT;
  if (decoded.startsWith("/login") || decoded.startsWith("/verify-mfa")) return DEFAULT_NEXT;
  if (/[\x00-\x1f]/.test(decoded)) return DEFAULT_NEXT;
  return decoded;
}

export default async function VerifyMfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const next = safeNext((await searchParams).next);

  if (requiresMfaEnrollment(user)) {
    redirect(`/settings/security?mfa=required&next=${encodeURIComponent(next)}`);
  }

  // If MFA is no longer required (e.g. user already verified in another tab),
  // skip straight to where they were going. Avoids stale page UX.
  if (!isMfaRequired(user)) {
    redirect(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Two-factor verification</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <strong>{user.email}</strong>
        </p>
      </div>
      <VerifyMfaForm next={next} />
    </div>
  );
}
