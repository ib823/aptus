import type { Metadata } from "next";

import { GrantsClient } from "@/components/control-tower/GrantsClient";
import { getCurrentUser } from "@/lib/auth/session";
import { canMutateControlTower } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access governance" };

/**
 * The decision controls are RENDERED CONDITIONALLY, not disabled.
 *
 * Unlike the registers' delegated actions — real capabilities that live in
 * another workspace, and so are shown disabled with a pointer to where they are
 * — deciding a grant is not somewhere else. It is here, and it is admin-only.
 * Showing a partner lead a disabled Approve button would imply the action
 * exists for them somewhere. It does not.
 *
 * This is a DISPLAY decision only. The server re-checks `canMutateControlTower`
 * on every PATCH, so hiding the control is not what makes it safe — it is what
 * stops the screen implying a capability the reader does not have.
 */
export default async function AccessGovernancePage() {
  const user = await getCurrentUser();
  return <GrantsClient canDecide={canMutateControlTower(user?.role)} />;
}
