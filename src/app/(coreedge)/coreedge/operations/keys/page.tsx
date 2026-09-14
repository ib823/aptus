import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { RevokeKey } from "@/components/coreedge/actions/RevokeKey";
import { SendClaimLink } from "@/components/coreedge/actions/SendClaimLink";
import { refuseRevokeKey, refuseSendClaimLink } from "@/lib/coreedge/authz";
import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { describeAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { KEY_IDLE_MS, keySuggestion, listKeys } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../CoreEdgeShell";

/**
 * Screen 09 · Operations › keys — keys nobody is using.
 *
 * D4, AND IT IS THE WHOLE POINT OF THE SCREEN. A key may be revoked by a
 * platform admin or a reviewer. An operator — who is the person most likely to
 * be looking at this list — flags and notifies, and never revokes, so for them
 * the revoke control does not render at all.
 *
 * THAT IS THE ONE EXCEPTION to this console's "a refused control keeps its
 * reason and its tab stop" rule, and the paragraph here used to claim the
 * opposite. The rule exists so a reader can tell "you may not do this" from
 * "this product cannot do this" — but it applies to actions that are yours
 * under some condition. Revocation is never an operator's under any condition,
 * and a greyed destructive button invites them to go and ask for it. The ROUTE
 * refuses them in the same words regardless: a screen that hides a button is
 * not a gate.
 *
 * O08 IS A SUGGESTION, NOT A SWEEP. "Unused" is a fact about traffic; "unwanted"
 * is a judgement about intent, and this screen only has the first. Nothing here
 * expires on its own and no row is pre-selected for removal.
 *
 * THE KEY IS NEVER SHOWN. `listKeys` does not select `tokenHash`, and MaskedKey
 * renders a prefix and four characters. A console that could display the value
 * would be a second place the key exists — exactly what the one-time claim link
 * is built to prevent.
 */

export const metadata: Metadata = { title: "Keys" };

export default async function KeysPage(): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  if (user.organizationId === null) {
    return (
      <CoreEdgeShell current="/coreedge/operations" title="Keys">
        <p className="max-w-prose text-sm text-ink-soft">
          Your account is not attached to an organization, so no keys are visible.
        </p>
      </CoreEdgeShell>
    );
  }

  const now = new Date();
  const keys = await listKeys(user.organizationId);
  /*
   * D4 and the send gate, resolved once from the same functions the routes run
   * — so what the screen renders and what the door allows cannot disagree.
   */
  const mayRevoke = refuseRevokeKey(user.role) === null;
  const sendRefusal = refuseSendClaimLink(user.role);
  const sendBlockedBecause = sendRefusal === null ? null : DISABLED_REASONS[sendRefusal];

  const worthAQuestion = keys.filter(
    (k) =>
      k.revokedAt === null &&
      (k.lastUsedAt === null || now.getTime() - k.lastUsedAt.getTime() > KEY_IDLE_MS),
  );

  return (
    <CoreEdgeShell
      current="/coreedge/operations"
      title="Keys"
      subtitle="Never used, or not used in 30 days · one key per app per environment"
      {...(worthAQuestion.length === 0
        ? {}
        : { badges: { "/coreedge/operations": worthAQuestion.length } })}
    >
      <p className="max-w-prose text-sm text-ink-muted">
        {GATE_GLYPHS["gate-info"]} {SCREEN_NOTES.keysSuggestionNotSweep}
      </p>

      <OpsTable
        caption="Issued keys, with what traffic says about each"
        legend={
          <span>
            {GATE_GLYPHS["gate-wait"]} worth a question · {GATE_GLYPHS["gate-ok"]} in active use
          </span>
        }
        rows={keys}
        rowKey={(k) => k.id}
        empty={<p className="text-sm text-ink-soft">{EMPTY_STATES.keysNone.message}</p>}
        columns={[
          {
            key: "key",
            header: "Key",
            cell: (k) => (
              <span className="flex flex-col gap-1">
                <span>
                  {k.appName} ·{" "}
                  {k.environment === null ? k.environmentRaw : ENVIRONMENT_LABELS[k.environment]}
                </span>
                <MaskedKey prefix="ce_" tail={k.tail} label={`Key for ${k.appName}`} />
              </span>
            ),
          },
          {
            key: "issued",
            header: "Issued",
            cell: (k) => describeAge(k.issuedAt, now) ?? "—",
          },
          {
            key: "used",
            header: "Last used",
            cell: (k) =>
              k.lastUsedAt === null ? (
                <span className="text-ink-muted">Never used</span>
              ) : (
                (describeAge(k.lastUsedAt, now) ?? "—")
              ),
          },
          {
            key: "suggestion",
            header: "Suggestion",
            cell: (k) => keySuggestion(k, now),
          },
          {
            key: "revoke",
            header: "Revoke",
            /*
             * D4 — an operator flags and notifies, and never revokes. For them
             * the control does not render AT ALL rather than rendering greyed:
             * a destructive action this person may never take under any
             * condition is not "unavailable right now", it is not theirs, and
             * showing it disabled invites them to ask for it.
             *
             * An already-revoked key is the opposite case and keeps its
             * control, disabled, with its reason — that action IS theirs; it
             * has simply already happened.
             */
            cell: (k) => (
              <RevokeKey
                clientId={k.id}
                describes={`${k.appName} · ${
                  k.environment === null ? k.environmentRaw : ENVIRONMENT_LABELS[k.environment]
                }`}
                mayRevoke={mayRevoke}
                alreadyRevoked={k.revokedAt !== null}
                idPrefix={`key-${k.id}`}
              />
            ),
          },
          {
            key: "send",
            header: "Send a link",
            /*
             * THE CONTROL THAT MAKES A KEY COLLECTABLE. Its absence is why
             * every lane in production reads "No key" with no way to collect
             * one: `createClaimLink` has been complete since PR-5 with no
             * caller anywhere in the repository.
             */
            cell: (k) =>
              k.revokedAt !== null ? (
                <span className="text-xs text-ink-muted">{DISABLED_REASONS.alreadyRevoked}</span>
              ) : k.environment === null ? (
                /*
                 * The row names an environment this product does not have. A
                 * link for it would mint a key the broker cannot match, so the
                 * control states the condition rather than issuing one.
                 */
                <span className="text-xs text-ink-muted">
                  {`"${k.environmentRaw}" is not one of Sandbox, Dev, Test or Prod.`}
                </span>
              ) : (
                <SendClaimLink
                  solutionId={k.solutionId}
                  environment={k.environment}
                  {...(sendBlockedBecause === null ? {} : { blockedBecause: sendBlockedBecause })}
                  idPrefix={`key-${k.id}`}
                />
              ),
          },
        ]}
      />
    </CoreEdgeShell>
  );
}
