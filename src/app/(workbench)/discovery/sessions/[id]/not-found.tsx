/**
 * Not-found boundary for /discovery/sessions/[id].
 *
 * Why this exists: without a boundary in this segment, a notFound() thrown by
 * the [id] page (a bad, deleted, or malformed session id) bubbles to the root
 * not-found — which is a dynamic component (`await cookies()`). Rendering a
 * dynamic fallback during an RSC prefetch is what turned a missing id into a
 * 503 instead of a clean 404. This boundary is deliberately static: no cookies,
 * no data, no async — so it renders identically on a hard navigation and on an
 * RSC prefetch, and a bad id is always a plain 404.
 */

import Link from "next/link";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";

export default function SessionNotFound() {
  return (
    <WorkbenchView
      breadcrumb="Sessions ▸ Not found"
      title="Session not found"
      caption="This session does not exist, or its link is no longer valid."
    >
      <Link
        href="/discovery/sessions"
        className="inline-flex h-[34px] items-center rounded-input border border-border-default bg-paper px-3.5 text-xs font-semibold text-navy focus-visible:shadow-focus-ring focus-visible:outline-none"
      >
        Back to sessions
      </Link>
    </WorkbenchView>
  );
}
