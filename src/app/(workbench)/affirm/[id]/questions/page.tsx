/**
 * /affirm/[id]/questions — Screen 2.5, the consultant question editor.
 *
 * The new screen between Scope and Affirm (v2 CCC follow-up §4). The
 * consultant reviews every in-scope L2 question, edits wording, sets
 * format (Decision/Information), enables/disables, reorders, and adds
 * custom questions before issuing.
 *
 * Available while bundle.state is "draft" OR "issued":
 *   - draft     : editing pre-issue. CTA = Issue to client.
 *   - issued    : editing post-issue (changes flow through to live
 *                 client view).
 *   - submitted : redirect to /review (client sealed; editor closed).
 *   - released  : redirect to /output.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getEditorRows,
  materializeBundleQuestions,
} from "@/lib/affirm/editor";
import { QuestionEditor } from "@/components/affirm/QuestionEditor";
import { AffirmStepper } from "@/components/affirm/AffirmStepper";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QuestionsEditorPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  const { id } = await params;

  const bundle = await prisma.affirmBundle.findUnique({ where: { id } });
  if (!bundle) notFound();
  if (bundle.state === "submitted") redirect(`/affirm/${id}/review`);
  if (bundle.state === "released") redirect(`/affirm/${id}/output`);

  // Lazy snapshot — idempotent. Ensures any newly-added scope items
  // get a join row so the editor can show + edit them.
  await materializeBundleQuestions(id);
  const rows = await getEditorRows(id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-4 text-xs text-ink-muted">
        <Link href="/affirm" className="hover:text-ink">
          Affirmations
        </Link>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink">{bundle.client}</span>
        <span className="px-1.5 text-ink-disabled">/</span>
        <span className="text-ink-soft">Question editor</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {bundle.client} ·{" "}
            {bundle.state === "draft" ? "Draft" : "Issued"}
          </p>
          <h1 className="font-serif text-3xl leading-10 text-ink">
            Question editor
          </h1>
          <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
            Every question in the bundle, before the client sees it (or as they see
            it now). Edit the plain-language wording, set the format, reorder,
            disable what doesn&apos;t apply, or add a custom question. The SAP
            verbatim is locked — it can never be edited or deleted, only collapsed.
          </p>
        </div>
        {bundle.state === "draft" && (
          <Link
            href={`/affirm/${id}/scope`}
            className="inline-flex h-10 items-center rounded-input border border-border-default bg-paper px-4 text-sm font-semibold text-ink-soft hover:bg-ink-tint"
          >
            ← Edit scope
          </Link>
        )}
      </header>

      <AffirmStepper
        current={bundle.state === "draft" ? "editor" : "affirm"}
      />

      {rows.length === 0 ? (
        <div className="rounded-card-warm border border-border-default bg-paper p-10 text-center shadow-card">
          <p className="font-serif text-xl text-ink">No questions in scope</p>
          <p className="mt-2 text-sm text-ink-muted">
            The selected scope items don&apos;t carry any BDC affirm questions yet.
            Go back to scope and add at least one item that has an affirm-set, or
            add a custom question here.
          </p>
        </div>
      ) : (
        <QuestionEditor
          bundleId={id}
          bundleState={bundle.state}
          rows={rows}
        />
      )}
    </div>
  );
}
