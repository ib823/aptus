/**
 * /tobe/[engagementId] — 2608 WS6. One engagement's To-Be Process Pack:
 * generate (or regenerate) it, read it (L1 / L2 / L3), export it.
 *
 * The engagement IS the affirm bundle; the id is the bundle id. Access is the
 * affirm rule (`affirmBundleReadableBy`): the consultant who created it, or a
 * platform admin — 404 otherwise, so the page never confirms a bundle exists.
 * Flag-gated: 404 unless TOBE_PACK_ENABLED=true.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GenerateButton } from "@/components/tobe/GenerateButton";
import { PackView } from "@/components/tobe/PackView";
import { affirmBundleReadableBy } from "@/lib/affirm/authz";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatDate } from "@/lib/format/date";
import { isTobePackEnabled } from "@/lib/tobe/guards";
import { latestPack } from "@/lib/tobe/inputs";
import { canPerformAffirmAction } from "@/lib/workbench/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ engagementId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { engagementId } = await params;
  const bundle = await prisma.affirmBundle.findUnique({ where: { id: engagementId }, select: { client: true } });
  return { title: bundle ? `To-Be pack · ${bundle.client}` : "To-Be pack" };
}

export default async function TobeEngagementPage({ params }: PageProps) {
  if (!isTobePackEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  const { engagementId } = await params;

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      client: true,
      state: true,
      country: true,
      createdById: true,
      scopeItems: { select: { scopeItemId: true }, orderBy: { scopeItemId: "asc" } },
      _count: { select: { responses: true, tobePacks: true } },
    },
  });
  if (!bundle) notFound();
  if (!affirmBundleReadableBy(bundle, user)) notFound();

  const pack = await latestPack(prisma, bundle.id);
  const canGenerate = canPerformAffirmAction(user.role, "create_bundle");
  const exportBase = `/api/tobe/${bundle.id}/export`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink-muted">
        <Link href="/tobe" className="hover:text-navy">
          To-Be Process Packs
        </Link>
        <span aria-hidden> / </span>
        <span>{bundle.client}</span>
      </nav>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Engagement · bundle {bundle.state}</p>
          <h1 className="font-serif text-3xl leading-10 text-ink">{bundle.client}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Scope {bundle.scopeItems.map((s) => s.scopeItemId).join(", ") || "— (no scope items)"} · {bundle._count.responses} answers ·{" "}
            {bundle._count.tobePacks} pack(s) generated
            {bundle.country ? ` · ${bundle.country}` : ""}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            <Link href={`/affirm/${bundle.id}`} className="hover:text-navy">
              Open the affirm bundle &rarr;
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {canGenerate && <GenerateButton bundleId={bundle.id} hasPack={pack !== null} />}
          {pack && (
            <p className="flex flex-wrap gap-3 text-xs">
              <a href={`${exportBase}?format=pdf`} className="font-semibold text-navy hover:text-navy-hover" data-testid="tobe-export-pdf">
                PDF
              </a>
              <a href={`${exportBase}?format=pptx`} className="font-semibold text-navy hover:text-navy-hover" data-testid="tobe-export-pptx">
                PPTX
              </a>
              <a href={`${exportBase}?format=svg&level=l1`} className="font-semibold text-navy hover:text-navy-hover" data-testid="tobe-export-svg">
                L1 SVG
              </a>
            </p>
          )}
        </div>
      </header>

      {pack ? (
        <>
          <p className="mb-6 text-xs text-ink-muted">
            Latest pack generated {formatDate(pack.generatedAt)} · pack {pack.id}
          </p>
          <PackView doc={pack.doc} consultantView />
        </>
      ) : (
        <div className="rounded-card-warm border border-dashed border-border-default bg-paper p-6 text-sm text-ink-soft" data-testid="tobe-empty">
          <p className="font-semibold text-ink">No pack generated yet.</p>
          <p className="mt-1">
            Generating reads the bundle&rsquo;s scope set, the client&rsquo;s answers and the To-Be rules, draws each scope item&rsquo;s steps from
            the 2608 business process documents and stores the result. Unanswered questions leave steps standard and are listed as such — the pack
            never guesses.
          </p>
          {bundle.scopeItems.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <caption className="sr-only">Scope items in this engagement</caption>
              <thead>
                <tr className="border-b border-border-default text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                  <th scope="col" className="py-2 pr-4">Scope item</th>
                </tr>
              </thead>
              <tbody>
                {bundle.scopeItems.map((s) => (
                  <tr key={s.scopeItemId}>
                    <th scope="row" className="py-1 pr-4 font-medium text-ink">
                      {s.scopeItemId}
                    </th>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
