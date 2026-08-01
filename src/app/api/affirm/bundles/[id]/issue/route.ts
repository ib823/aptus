/**
 * POST /api/affirm/bundles/[id]/issue — transition DRAFT -> ISSUED.
 *
 * Snapshots the in-scope L2 questions onto the bundle (via the
 * AffirmBundleQuestion join) so a later question-bank edit cannot
 * mutate what the client sees.
 *
 * v2 (CCC follow-up §4): the 15 SAP-excluded rows are kept in the
 * record but ARRIVE PRE-DISABLED (enabled=false). The client view
 * filters by enabled=true; the consultant editor sees them so the
 * audit record is complete.
 *
 * Defensive: this endpoint is idempotent with respect to the editor
 * pre-materialization (the editor page may pre-create rows in DRAFT
 * state). We `upsert` per join row so editor edits — wording flips,
 * format toggles, disables — are preserved through issue.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { assertTransition } from "@/lib/affirm/bundle";
import { requireAffirmBundleAccess } from "@/lib/affirm/authz";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireAffirmBundleAccess(id, user);
  if (!access.ok) return access.response;

  const result = await prisma.$transaction(async (tx) => {
    const bundle = await tx.affirmBundle.findUnique({
      where: { id },
      include: {
        scopeItems: {
          select: { scopeItemId: true, scopeItem: { select: { streamId: true } } },
        },
      },
    });
    if (!bundle) return { error: "not_found" as const };
    try {
      assertTransition(bundle.state as never, "issued");
    } catch {
      return { error: "illegal_transition" as const };
    }

    const scopeIds = bundle.scopeItems.map((s) => s.scopeItemId);
    if (scopeIds.length === 0) {
      return { error: "empty_scope" as const };
    }
    // v2.1 data fix: 71 of 150 L2 questions have empty scopeItemRefs
    // (stream-level Business Overview etc.). Union them in by stream.
    const streamIds = Array.from(
      new Set(bundle.scopeItems.map((s) => s.scopeItem.streamId)),
    );

    // All in-scope questions, including excluded — excluded come in
    // disabled (enabled=false) so they live in the audit record without
    // being shown to the client.
    const questions = await tx.affirmQuestion.findMany({
      where: {
        OR: [
          { scopeItemRefs: { hasSome: scopeIds } },
          { scopeItemRefs: { isEmpty: true }, streamId: { in: streamIds } },
        ],
      },
      select: {
        id: true,
        status: true,
        displayOrder: true,
        format: true,
        // Frozen onto the join row below. Without these the bundle keeps
        // reading the shared bank and "issued" means nothing.
        consultantWording: true,
        plainLanguageSuggested: true,
        aboutText: true,
        standardMeans: true,
      },
    });

    /*
     * THE CONSULTANT CONFIRM PASS IS A GATE, NOT A CAVEAT.
     *
     * Every question ships as status="suggested" — wording drafted by the
     * generator, awaiting a consultant to sign it off as "confirmed". The
     * product states plainly that this pass is "the mandatory gate before any
     * client-facing launch", and the release-candidate panel lists the
     * still-suggested questions as caveats.
     *
     * It was documentation, not a control. A bundle whose eight questions all
     * carried the auto-generated draft could be issued, answered by the client,
     * and released as "the signed affirmation record" — a client affirming
     * wording no consultant ever read. Caveat text on the screen a consultant
     * reads does not bind the artefact a client signs.
     *
     * Excluded questions are exempt: they are never shown, so nobody needs to
     * confirm their wording. The check is on what the client will actually see.
     */
    const unconfirmed = questions.filter((q) => q.status === "suggested");
    if (unconfirmed.length > 0) {
      return {
        error: "unconfirmed_questions" as const,
        unconfirmed: unconfirmed.map((q) => q.id),
      };
    }

    // Upsert per row so editor-state (wording, format, displayOrder,
    // enabled) is preserved if the consultant already opened the editor.
    const frozenAt = new Date();
    for (const q of questions) {
      const isExcluded = q.status === "excluded";
      /*
       * THE SNAPSHOT HAS TO CARRY THE WORDS.
       *
       * This header has always said issuing snapshots the questions "so a
       * later question-bank edit cannot mutate what the client sees". It
       * snapshotted enabled/displayOrder/format — the join row's own columns —
       * and left the text on the shared AffirmQuestion bank, where any other
       * bundle's editor could still rewrite it out from under an issued,
       * already-answered bundle.
       */
      const frozen = {
        frozenWording: q.consultantWording ?? q.plainLanguageSuggested,
        frozenAboutText: q.aboutText,
        frozenStandardMeans: q.standardMeans,
        frozenAt,
      };
      await tx.affirmBundleQuestion.upsert({
        where: {
          bundleId_questionId: { bundleId: id, questionId: q.id },
        },
        // The editor's enabled/order/format choices win on issue, but the
        // content freeze is applied unconditionally: a row the editor
        // pre-created in draft has never been frozen.
        update: frozen,
        create: {
          bundleId: id,
          questionId: q.id,
          enabled: !isExcluded,
          displayOrder: q.displayOrder,
          // v2.1: SAP default format from the question bank. Consultant
          // override on the join row wins after first edit.
          format: q.format,
          ...frozen,
        },
      });
    }

    await tx.affirmBundle.update({
      where: { id },
      data: { state: "issued", issuedAt: new Date() },
    });

    const enabledCount = await tx.affirmBundleQuestion.count({
      where: { bundleId: id, enabled: true },
    });
    const disabledCount = questions.length - enabledCount;

    await tx.affirmEvent.create({
      data: {
        bundleId: id,
        type: "issued",
        actorId: user.id,
        payload: {
          totalQuestions: questions.length,
          enabledQuestions: enabledCount,
          disabledQuestions: disabledCount,
        },
      },
    });

    return { ok: true as const, questions: enabledCount, totalSnapshot: questions.length };
  });

  if ("error" in result) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "empty_scope" || result.error === "unconfirmed_questions"
          ? 400
          : 409;
    if (result.error === "unconfirmed_questions") {
      const n = result.unconfirmed.length;
      return NextResponse.json(
        {
          error: result.error,
          unconfirmed: result.unconfirmed,
          message:
            `${n} question${n === 1 ? "" : "s"} still carry the auto-suggested draft wording. ` +
            "Confirm the plain-language wording in the question editor before issuing — " +
            "the client signs what this bundle asks, so no question reaches them unread.",
        },
        { status },
      );
    }
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    questions: result.questions,
    totalSnapshot: result.totalSnapshot,
  });
}
