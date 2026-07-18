/**
 * C8 · Facilitation console — /discovery/sessions/[id]/facilitate.
 *
 * The consultant's private driver. The context chip flips to the live state
 * (cta-red) while projecting, per D15 and §9.1 — the chip's job is telling the
 * consultant whether the client can see this, and during a session the answer
 * changes.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FacilitationConsole } from "@/components/discovery/workbench/FacilitationConsole";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import { getConsole } from "@/lib/discovery/workbench/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Facilitate", robots: { index: false, follow: false } };

export default async function FacilitatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getConsole(id);
  if (!view) notFound();

  return (
    <WorkbenchView
      breadcrumb="Sessions ▸ Facilitate"
      title={`Facilitating — ${view.session.client}`}
      caption="Your console. The client sees only the projected view."
      context={view.session.live ? "live" : "consultant-only"}
      client={view.session.client}
    >
      <FacilitationConsole view={view} />
    </WorkbenchView>
  );
}
