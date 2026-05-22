/**
 * /affirm/[id] — Screen 2, client affirm cards.
 *
 * Available when the bundle is in ISSUED state. For SUBMITTED bundles
 * we render read-only with a sealed banner. DRAFT bundles redirect to
 * the consultant scope picker; RELEASED bundles redirect to the output.
 *
 * Per the master prompt, every L2 question shows dual display (plain
 * language up top + SAP verbatim "source of truth" beneath), defaults
 * to "Adopt SAP standard", and requires a reason on deviate.
 */
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { getAffirmSetForBundle } from "@/lib/affirm/queries";
import { AffirmCardList } from "@/components/affirm/AffirmCardList";
import { AffirmStepper } from "@/components/affirm/AffirmStepper";
import type { AffirmChoice } from "@/lib/affirm/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientAffirmPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  const { id } = await params;

  const bundle = await prisma.affirmBundle.findUnique({
    where: { id },
    include: {
      responses: {
        select: { questionId: true, choice: true, reason: true },
      },
    },
  });
  if (!bundle) notFound();
  if (bundle.state === "draft") redirect(`/affirm/${id}/scope`);
  if (bundle.state === "released") redirect(`/affirm/${id}/output`);

  // Client view: drop excluded questions per master prompt caveat 1.
  const questions = await getAffirmSetForBundle(id, { forClient: true });

  // Compute display stream — most bundles cover a single value stream;
  // we honour multi-stream bundles by joining the unique stream names.
  const streamNames = Array.from(new Set(questions.map((q) => q.streamName)));
  const streamDisplay =
    streamNames.length === 0
      ? "No in-scope questions"
      : streamNames.length === 1
        ? streamNames[0]!
        : `${streamNames.length} value streams`;

  return (
    <main className="bg-cream">
      <div className="mx-auto max-w-[880px] px-8 py-7">
        <AffirmStepper current="affirm" />
        <AffirmCardList
          bundleId={id}
          client={bundle.client}
          streamName={streamDisplay}
          questions={questions}
          initialAnswers={bundle.responses.map((r) => ({
            questionId: r.questionId,
            choice: r.choice as AffirmChoice,
            reason: r.reason,
          }))}
          readOnly={bundle.state === "submitted"}
        />
      </div>
    </main>
  );
}
