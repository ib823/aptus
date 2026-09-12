import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { OpsTable } from "@/components/coreedge/OpsTable";
import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { describeAge } from "@/lib/coreedge/freshness";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { KEY_IDLE_MS, keySuggestion, listKeys } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { reasonIdFor } from "@/lib/coreedge/disabled";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../CoreEdgeShell";

/**
 * Screen 09 · Operations › keys — keys nobody is using.
 *
 * D4, AND IT IS THE WHOLE POINT OF THE SCREEN. A key may be revoked by a
 * platform admin or a reviewer. An operator — who is the person most likely to
 * be looking at this list — flags and notifies, and never revokes. So the
 * revoke control renders for everyone and carries that reason for an operator,
 * rather than vanishing: a control that disappears teaches the reader that the
 * feature does not exist, and the next question is asked in a support channel.
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
            // D4 — operators flag, they never revoke. The reason is a sibling
            // string on a control that stays in the tab order, never a title.
            cell: (k) => {
              const reason =
                k.revokedAt !== null
                  ? DISABLED_REASONS.alreadyRevoked
                  : DISABLED_REASONS.revokeNotOperator;
              const reasonId = reasonIdFor(`revoke-${k.id}`);
              return (
                <span className="flex flex-col items-start gap-1">
                  {/*
                   * aria-disabled rather than `disabled`, so the control keeps
                   * its tab stop and the reason is reachable by keyboard. No
                   * onClick: there is no handler to swallow, and a server
                   * component cannot hand one to the client anyway.
                   */}
                  <button
                    type="button"
                    aria-disabled="true"
                    aria-describedby={reasonId}
                    className="text-left text-sm text-ink-disabled"
                  >
                    Revoke
                  </button>
                  <span id={reasonId} className="max-w-prose text-xs text-ink-muted">
                    {reason}
                  </span>
                </span>
              );
            },
          },
        ]}
      />
    </CoreEdgeShell>
  );
}
