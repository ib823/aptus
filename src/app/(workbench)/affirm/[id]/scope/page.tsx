/**
 * /affirm/[id]/scope — Screen 1 in edit mode.
 *
 * Available only while the bundle is in DRAFT state. Once issued, the
 * scope is frozen; we redirect to the review page.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { bundleMetadata } from "@/lib/affirm/page-metadata";
import { getCurrentUser } from "@/lib/auth/session";
import { affirmBundleReadableBy } from "@/lib/affirm/authz";
import { getValueStreamTree } from "@/lib/affirm/queries";
import { ValueStreamTreePicker } from "@/components/affirm/ValueStreamTreePicker";
import { AffirmStepper } from "@/components/affirm/AffirmStepper";
import { ScreenGuide } from "@/components/affirm/learn/ScreenGuide";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return bundleMetadata(params, "Scope");
}

export default async function EditScopePage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  const { id } = await params;

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id },
    include: { scopeItems: { select: { scopeItemId: true } } },
  });
  if (!bundle) notFound();
  // Same rule the API enforces. Without it this page rendered any consultant's
  // bundle to any signed-in user; 404 rather than 403 so it does not confirm
  // that a bundle with this id exists.
  if (!affirmBundleReadableBy(bundle, user)) notFound();
  if (bundle.state !== "draft") redirect(`/affirm/${id}/review`);

  const tree = await getValueStreamTree();

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/affirm" className="hover:text-ink">
          Affirmations
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">{bundle.client}</span>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink-soft">Scope</span>
      </nav>
      <header className="mb-5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {bundle.client} · draft
        </p>
        <h1 className="font-serif text-3xl leading-10 text-ink">Edit scope</h1>
        <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
          Once you issue the bundle to the client, scope is frozen and the in-scope L2
          questions are snapshot.
        </p>
      </header>

      <AffirmStepper current="scope" />
      <ScreenGuide />

      <ValueStreamTreePicker
        tree={tree}
        mode="edit"
        bundleId={id}
        initialClient={bundle.client}
        initialSelected={bundle.scopeItems.map((s) => s.scopeItemId)}
      />
    </div>
  );
}
