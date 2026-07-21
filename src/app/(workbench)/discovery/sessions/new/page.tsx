/**
 * C7 · New session — /discovery/sessions/new.
 *
 * The engagement-setup form for a brand-new session: name the client, scope the
 * value streams, invite reviewers, Launch. On launch the session (a
 * DiscoveryEngagement) is created server-side and the consultant lands on
 * /discovery/sessions/[id].
 *
 * A static segment, so it always wins over the sibling [id] route — which is
 * exactly the bug this fixes: "New session" pointed at /discovery/sessions/new
 * with no route here, so the id="new" fell through to [id] and 404'd.
 *
 * Flag-gated by the (workbench)/discovery layout (unset NEUTRAL_DISCOVERY_ENABLED
 * ⇒ the whole section 404s), and auth-gated by the (workbench) group layout.
 */

import type { Metadata } from "next";
import { NewSession } from "@/components/discovery/workbench/NewSession";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { clientValueStreams } from "@/lib/discovery/client-library";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "New session" };

export default function NewSessionPage() {
  const streams = clientValueStreams().map((vs) => ({
    id: vs.id,
    name: vs.name,
    processCount: vs.workflows.reduce((n, wf) => n + wf.processes.length, 0),
  }));

  return (
    <WorkbenchView
      breadcrumb="Sessions ▸ New"
      title="New session"
      caption="Name the engagement, scope it to the streams this client cares about, and invite their reviewers."
    >
      <NewSession streams={streams} />
    </WorkbenchView>
  );
}
