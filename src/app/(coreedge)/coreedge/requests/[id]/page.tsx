import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CheckList, type Check } from "@/components/coreedge/CheckList";
import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { StatusChip } from "@/components/coreedge/StatusChip";
import { ACTIONS, DISABLED_REASONS } from "@/lib/coreedge/copy";
import { describeAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { getRequest, listSapSystems } from "@/lib/coreedge/queries";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../CoreEdgeShell";

/**
 * Screen 03 · Requests › review — "Ikmal raised this, so he can't be the one to
 * approve it. That separation is the point of the screen."
 *
 * THE REFUSAL IS THE FEATURE, and it is rendered rather than enforced only in
 * the API: a reviewer who is shown an enabled Approve button and then gets a 403
 * has been misled by the screen. The button is present, focusable, and carries
 * the reason — never hidden, because hiding it would leave the reader unsure
 * whether they lack a permission or the product lacks a feature.
 *
 * THIS SCREEN DOES NOT DECIDE. The actions carry no handlers yet: approving,
 * rejecting and requesting changes are backend capabilities that PR-5 provides,
 * and wiring a button to nothing would be worse than a button that says why it
 * cannot act. Every control here states its condition instead.
 */

export const metadata: Metadata = { title: "Review access" };

export default async function RequestReview({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) notFound();

  const { id } = await params;
  const now = new Date();
  const request = await getRequest(user.organizationId, id);
  if (request === null) notFound();

  const systems = await listSapSystems(user.organizationId);

  const isOwnRequest = request.requestedById === user.id;
  const hasExpiry = request.expiresAt !== null;
  const targetEnvironment = request.environment;
  const hasSystemForEnvironment =
    targetEnvironment !== null && systems.some((s) => s.environment === targetEnvironment);

  /*
   * The four review checks, each computed from a real row rather than asserted.
   * A checklist that says "green" without something behind it is decoration.
   */
  const checks: Check[] = [
    {
      state: isOwnRequest ? "fail" : "pass",
      title: "A colleague raised this",
      detail: isOwnRequest
        ? DISABLED_REASONS.ownRequest
        : `Requested by ${request.requestedByName ?? "a colleague"}`,
      ...(isOwnRequest ? { owner: "reviewer" as const } : {}),
    },
    {
      state: hasExpiry ? "pass" : "fail",
      title: "End date set",
      detail: hasExpiry
        ? (request.expiresAt?.toISOString().slice(0, 10) ?? "")
        : DISABLED_REASONS.missingExpiry,
      ...(hasExpiry ? {} : { owner: "reviewer" as const }),
    },
    {
      state: targetEnvironment === null ? "fail" : hasSystemForEnvironment ? "pass" : "fail",
      title: "SAP system connected for this environment",
      detail:
        targetEnvironment === null
          ? `The request names "${request.environmentRaw}", which is not one of Sandbox, Dev, Test or Prod.`
          : hasSystemForEnvironment
            ? `${ENVIRONMENT_LABELS[targetEnvironment]} system connected`
            : targetEnvironment === "PROD"
              ? DISABLED_REASONS.noProdSystem
              : `No ${ENVIRONMENT_LABELS[targetEnvironment]} SAP system is connected yet.`,
      ...(targetEnvironment !== null && hasSystemForEnvironment
        ? {}
        : { owner: "platformAdmin" as const }),
    },
    {
      /*
       * Not "skipped" as a way of avoiding the question: the write checklist is
       * a PR-5 capability, and a check that cannot run says so rather than
       * passing by default.
       */
      state: "skipped",
      title: "Write checklist confirmed",
      detail: "Not applicable — this request is for reads.",
    },
  ];

  const blockingReason = isOwnRequest
    ? DISABLED_REASONS.ownRequest
    : !hasExpiry
      ? DISABLED_REASONS.missingExpiry
      : targetEnvironment === "PROD" && !hasSystemForEnvironment
        ? DISABLED_REASONS.noProdSystem
        : "Deciding a request is a backend capability that does not exist yet.";

  return (
    <CoreEdgeShell
      current="/coreedge/requests"
      title={`Review access · ${request.appName}`}
      subtitle={`${request.feedLabel} → ${
        targetEnvironment === null ? request.environmentRaw : ENVIRONMENT_LABELS[targetEnvironment]
      }`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <StatusChip status="inReview" />
        <span className="text-sm text-ink-soft">
          Requested{" "}
          {request.requestedById === user.id
            ? "by you"
            : `by ${request.requestedByName ?? "a colleague"}`}
          {/*
            * How long it has waited — the age that means something for a
            * review. Not passed to the chip: StatusChip announces its age as
            * "checked …", and nothing has checked a request.
            */}
          {` · waiting ${describeAge(request.createdAt, now) ?? "just now"}`}
        </span>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink">Why they asked</h2>
        <p className="max-w-prose rounded-[var(--radius-card-warm)] bg-ink-tint p-4 text-sm text-ink">
          {request.justification}
        </p>
      </section>

      <CheckList caption="Review checks" checks={checks} />

      <DecisionBar
        idPrefix="review"
        primary={{ label: ACTIONS.approve.button, disabledReason: blockingReason }}
        narrower={[
          {
            label: ACTIONS.approveReadOnly.button,
            disabledReason: blockingReason,
          },
          {
            label: ACTIONS.requestChanges.button,
            disabledReason: isOwnRequest
              ? DISABLED_REASONS.ownRequest
              : "Requesting changes is a backend capability that does not exist yet.",
          },
        ]}
        destructive={{
          label: ACTIONS.reject.button,
          disabledReason: isOwnRequest
            ? DISABLED_REASONS.ownRequest
            : "Declining a request is a backend capability that does not exist yet.",
        }}
      />

      {/*
        DECISION D2 in the open: SANDBOX_ONLY is kept so historical rows keep
        meaning what they meant, and is never offered again. It is absent from
        the bar above rather than present-and-disabled, because a control nobody
        should ever use again is not a control.
      */}
      <p className="max-w-prose text-xs text-ink-muted">
        Sandbox-only approval is no longer offered. Existing sandbox-only grants keep working and
        are shown as &quot;Approved for Sandbox (historical)&quot;.
      </p>
    </CoreEdgeShell>
  );
}
