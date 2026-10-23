import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ParityScorecard } from "@/components/control-tower/ParityScorecard";
import { isAdminRole, isMfaRequired, requiresMfaEnrollment } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { readBuildStamp } from "@/lib/build-stamp";
import { PARITY_SCORECARD } from "@/lib/coreedge/parity-scorecard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parity scorecard" };

const PATH = "/control-tower/parity";

/**
 * The parity scorecard (roadmap P1.9): deployment-scoped and platform-admin
 * gated, like Catalogue health. The layout already removes it from every
 * other persona's rail.
 *
 * THIS PAGE GATES ITSELF, and before it renders a figure. The other Control
 * Tower pages can rely on the layout because their data arrives later from
 * gated API routes. This one renders its figures on the server, and a layout
 * renders concurrently with its page: it cannot keep the page's payload from
 * a caller it refuses. So the page repeats the session, role and MFA checks.
 * `getCurrentUser` is cached per request, so this costs no second statement.
 */
export default async function ParityScorecardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (!isAdminRole(user.role)) {
    return (
      <div style={{ maxWidth: 560, padding: "40px 0" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>The parity scorecard is platform-scoped</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-secondary)", marginTop: 10 }}>
          It compares the whole product with SAP Integration Suite, from the gap simulator. There is no per-organization
          figure on it, which is why it is open to platform administrators rather than scoped to a tenant.
        </p>
      </div>
    );
  }
  // The layout's step-up, repeated for the reason above.
  if (isMfaRequired(user)) {
    const next = encodeURIComponent(PATH);
    redirect(requiresMfaEnrollment(user) ? `/settings/security?mfa=required&next=${next}` : `/verify-mfa?next=${next}`);
  }
  return <ParityScorecard scorecard={PARITY_SCORECARD} build={readBuildStamp()} />;
}
