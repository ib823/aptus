/**
 * GET /a/tobe — 2608 WS6. The client's view of the To-Be Process Pack for the
 * bundle their guest grant opens. Same fail-closed session + per-device OTP
 * gate as every /a/* screen; renders `clientView` (consultant notes removed);
 * no generate, no export — the pack is what the consultant last generated.
 */
import { redirect, notFound } from "next/navigation";

import { GuestShell } from "@/components/affirm/external/GuestShell";
import { PackView } from "@/components/tobe/PackView";
import { writeGuestEvent } from "@/lib/affirm/external/audit";
import { isDeviceVerified, requireGuestSession } from "@/lib/affirm/external/guards";
import { touchGuestSession } from "@/lib/affirm/external/session";
import { prisma } from "@/lib/db/prisma";
import { clientView } from "@/lib/tobe/engine";
import { isTobePackEnabled } from "@/lib/tobe/guards";
import { latestPack } from "@/lib/tobe/inputs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuestTobePage() {
  if (!isTobePackEnabled()) notFound();
  const ctx = await requireGuestSession();
  if (!ctx) redirect("/a/expired");
  if (!isDeviceVerified(ctx.grant, ctx.uaHash)) {
    await writeGuestEvent({
      bundleId: ctx.bundle.id,
      type: "external_action_denied",
      grantId: ctx.grant.id,
      payload: { reason: "otp_required", path: "/a/tobe" },
    });
    redirect("/a/verify");
  }
  void touchGuestSession(ctx.session.id);

  const pack = await latestPack(prisma, ctx.bundle.id);

  return (
    <GuestShell granteeName={ctx.grant.displayName} granteeRole={ctx.grant.roleLabel} clientName={ctx.bundle.client}>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <header className="mb-8">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">To-Be process</p>
          <h1 className="font-serif text-3xl leading-10 text-ink">{ctx.bundle.client}</h1>
          <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
            How your processes will run: the end-to-end flow, each process as a swimlane, and every step with its state.
            Built only from the scope you agreed and the answers you gave.
          </p>
        </header>
        {pack ? (
          <PackView doc={clientView(pack.doc)} consultantView={false} />
        ) : (
          <p className="rounded-card-warm border border-dashed border-border-default bg-paper p-6 text-sm text-ink-soft">
            Your consultant has not generated the to-be process pack yet.
          </p>
        )}
      </main>
    </GuestShell>
  );
}
