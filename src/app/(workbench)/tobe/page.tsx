/**
 * /tobe — 2608 WS6. The consultant's list of engagements (affirm bundles)
 * with their latest To-Be Process Pack, if any. Flag-gated: 404 unless
 * TOBE_PACK_ENABLED=true. Scoped to the caller with the same rule the affirm
 * list uses (`affirmBundleScope`).
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { affirmBundleScope } from "@/lib/affirm/authz";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
import { isTobePackEnabled } from "@/lib/tobe/guards";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: { absolute: "To-Be Process Packs — ABeam Workbench" },
};

export default async function TobeIndexPage() {
  if (!isTobePackEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  const bundles = await prisma.affirmBundle.findMany({
    where: affirmBundleScope(user),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      client: true,
      state: true,
      createdAt: true,
      _count: { select: { scopeItems: true, responses: true } },
      tobePacks: { orderBy: { generatedAt: "desc" }, take: 1, select: { generatedAt: true, inputsHash: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Fit-to-Standard · To-Be</p>
        <h1 className="font-serif text-3xl leading-10 text-ink">To-Be Process Packs</h1>
        <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
          One pack per engagement: the end-to-end chain (L1), a swimlane per scope item (L2) and the step table (L3), derived only from the
          scope set, the client&rsquo;s answers and the 2608 business process documents. Nothing in a pack is inferred.
        </p>
      </header>

      {bundles.length === 0 ? (
        <p className="rounded-card-warm border border-dashed border-border-default bg-paper p-6 text-sm text-ink-soft">
          No engagements yet. Create an affirm bundle first; it appears here as an engagement.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card-warm border border-border-default bg-paper">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Engagements and their latest pack</caption>
            <thead>
              <tr className="border-b border-border-default text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                <th scope="col" className="px-4 py-3">Engagement</th>
                <th scope="col" className="px-4 py-3">Bundle state</th>
                <th scope="col" className="px-4 py-3">Scope items</th>
                <th scope="col" className="px-4 py-3">Answers</th>
                <th scope="col" className="px-4 py-3">Latest pack</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const pack = b.tobePacks[0];
                return (
                  <tr key={b.id} className="border-b border-border-default/60">
                    <th scope="row" className="px-4 py-3 font-medium text-ink">
                      {b.client}
                      <span className="block text-xs font-normal text-ink-muted">created {formatDate(b.createdAt)}</span>
                    </th>
                    <td className="px-4 py-3 text-ink-soft">{b.state}</td>
                    <td className="px-4 py-3 text-ink-soft">{b._count.scopeItems}</td>
                    <td className="px-4 py-3 text-ink-soft">{b._count.responses}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {pack ? (
                        <>
                          {formatDate(pack.generatedAt)}
                          <span className="block text-xs text-ink-muted">inputs {pack.inputsHash.slice(0, 12)}</span>
                        </>
                      ) : (
                        <span className="text-ink-muted">not generated</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/tobe/${b.id}`} className="text-sm font-semibold text-navy hover:text-navy-hover">
                        Open &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
