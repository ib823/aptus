import type { Metadata } from "next";

import { DesignSystemClient } from "./DesignSystemClient";

/**
 * /coreedge/design-system — the living reference.
 *
 * LIVING means every specimen on this page is rendered by the real component
 * from the real vocabulary. Nothing here is a screenshot, a hand-written copy of
 * a chip, or a list of status names typed out a second time. A reference that
 * can disagree with the product is worse than no reference, because people trust
 * it — so the page iterates `LANE_STATUSES` and `STATUS_LITERAL_MAP` directly,
 * and a component that changes changes here too, in the same commit, without
 * anyone remembering to.
 *
 * WHO SEES IT. Everyone signed in, like every other /coreedge route — the group
 * layout redirects an anonymous caller and nobody else. The build brief marks
 * this page "consultant + platform_admin", which is an audience rather than a
 * gate: it is who the page is written for and who gets it in their rail, not who
 * is permitted to read it. Redirecting the others would contradict the rule that
 * governs the whole namespace, and there is nothing here to protect — it renders
 * no customer data, no keys and no tenant state, only the console's own
 * vocabulary. The divergence is deliberate and recorded in PR-3's write-up.
 */

export const metadata: Metadata = {
  title: "Design system",
  description:
    "Every CoreEdge component in every state, rendered from the same modules the product uses.",
};

export default function DesignSystemPage() {
  return <DesignSystemClient />;
}
