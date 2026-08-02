/**
 * C7 · Session setup — /discovery/sessions/[id].
 *
 * Scope + reviewers. The reviewer grants table follows the Affirm S9 pattern:
 * status derived from the grant's own lifecycle, never a stored label.
 */

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { discoveryEngagementReadable } from "@/lib/discovery/authz";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SessionSetup } from "@/components/discovery/workbench/SessionSetup";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { clientValueStreams } from "@/lib/discovery/client-library";
import { getSession } from "@/lib/discovery/workbench/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await getSession(id);
  return { title: s ? `${s.client} — session` : "Session" };
}

export default async function SessionSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  // The engagement's own data. Same rule the API applies; notFound() rather
  // than a redirect so it does not confirm the engagement exists.
  if (!(await discoveryEngagementReadable(id, user))) notFound();
  const session = await getSession(id);
  if (!session) notFound();

  const streams = clientValueStreams().map((vs) => ({
    id: vs.id,
    name: vs.name,
    processCount: vs.workflows.reduce((n, wf) => n + wf.processes.length, 0),
  }));

  return (
    <WorkbenchView
      breadcrumb="Sessions ▸ Setup"
      title={session.client}
      caption={`${session.processCount} processes in scope · ${session.reviewers.length} reviewers`}
      actions={
        <Link
          href={`/discovery/sessions/${session.id}/facilitate`}
          className="flex h-[34px] items-center rounded-input bg-cta px-3.5 text-xs font-semibold text-white focus-visible:shadow-focus-ring focus-visible:outline-none"
        >
          {session.live ? "Return to console" : "Launch session"}
        </Link>
      }
    >
      <SessionSetup session={session} streams={streams} />
    </WorkbenchView>
  );
}
