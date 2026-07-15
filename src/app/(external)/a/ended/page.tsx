/**
 * GET /a/ended — S3 terminal, explicit sign-out. Pure static.
 */

import { GuestTerminal } from "@/components/affirm/external/GuestTerminal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AffirmEndedPage() {
  return (
    <GuestTerminal
      eyebrow="ABeam Workbench"
      heading="This review has ended"
      body="Thank you — nothing more is needed from you here. Your ABeam consultant will be in touch with next steps. You can return any time using the secure link in your invitation email."
    />
  );
}
