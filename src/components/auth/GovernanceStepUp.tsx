/**
 * Mounted once by each console layout that hosts a governance action
 * (CoreEdge, Developer Studio, Control Tower): the banner, when this person
 * should see one, and the dialog that answers a STEP_UP_REQUIRED refusal.
 *
 * A server component, so the mode is read where the env lives and the browser
 * receives only the sentence it needs.
 */

import { StepUpBanner } from "@/components/auth/StepUpBanner";
import { StepUpDialog } from "@/components/auth/StepUpDialog";
import { stepUpBannerState, stepUpMode } from "@/lib/auth/step-up";
import type { SessionUser } from "@/types/assessment";

export function GovernanceStepUp({ user }: { user: Pick<SessionUser, "role" | "hasWebAuthn"> }) {
  const mode = stepUpMode();
  if (mode === "off") return null;
  const banner = stepUpBannerState(user, mode);
  return (
    <>
      {banner && <StepUpBanner mode={banner.mode} hasPasskey={banner.hasPasskey} />}
      <StepUpDialog />
    </>
  );
}
