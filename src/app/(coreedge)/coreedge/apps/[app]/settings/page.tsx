import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DecisionBar } from "@/components/coreedge/DecisionBar";
import { MaskedKey } from "@/components/coreedge/MaskedKey";
import { DISABLED_REASONS, EMPTY_STATES, SCREEN_NOTES } from "@/lib/coreedge/copy";
import { ENVIRONMENT_LABELS } from "@/lib/coreedge/lanes";
import { getAppSettings } from "@/lib/coreedge/queries";
import { GATE_GLYPHS } from "@/lib/coreedge/status-vocabulary";
import { getCurrentUser } from "@/lib/auth/session";

import { CoreEdgeShell } from "../../../CoreEdgeShell";

/**
 * Screen 11 · App settings — including the one irreversible thing.
 *
 * RETIRING IS PERMANENT AND THE SCREEN SAYS SO BEFORE IT OFFERS IT. Every key
 * the app holds stops in every environment, and Try it refuses too: A06 is
 * explicit that there is no read-only afterlife, because an in-console tester
 * that still worked would be a back door with a friendly name. The timeline and
 * audit record are kept.
 *
 * THE BLAST RADIUS IS COUNTED LIVE, never cached. A06: a cached count could say
 * three lanes when a fourth was bound this morning, and a confirmation must
 * never under-state what an app is still doing. `getAppSettings` reads it on
 * every render for that reason.
 *
 * CONFIRMATION IS BY ADDRESS, NOT NAME. Two apps can share a name — the empty
 * twin in A06 does exactly that — and the name is precisely how the wrong one
 * gets retired. The address is unique per organization, so it is the only
 * reliable guard.
 */

export const metadata: Metadata = { title: "App settings" };

export default async function AppSettingsPage({
  params,
}: {
  readonly params: Promise<{ readonly app: string }>;
}): Promise<ReactNode> {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");
  if (user.organizationId === null) notFound();

  const { app } = await params;
  const settings = await getAppSettings(user.organizationId, app);
  if (settings === null) notFound();

  const liveKeys = settings.keys.filter((k) => k.revokedAt === null);

  return (
    <CoreEdgeShell
      current="/coreedge"
      title={settings.name}
      subtitle={`Settings · ${settings.slug}`}
    >
      <dl className="flex flex-wrap gap-8">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Address</dt>
          <dd className="font-mono text-sm text-ink">{settings.slug}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Status</dt>
          <dd className="text-ink">{settings.status}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink">What retiring would stop</h2>
        <ul className="flex flex-col gap-1 text-sm text-ink-soft">
          <li>
            {GATE_GLYPHS["gate-bad"]} {liveKeys.length}{" "}
            {liveKeys.length === 1 ? "key" : "keys"} stop, in every environment
            {liveKeys.length === 0 ? null : (
              <ul className="mt-1 flex flex-col gap-1 pl-6">
                {liveKeys.map((k) => (
                  <li key={k.id} className="flex items-center gap-2">
                    <span>
                      {k.environment === null
                        ? k.environmentRaw
                        : ENVIRONMENT_LABELS[k.environment]}
                    </span>
                    <MaskedKey prefix="ce_" tail={k.tail} label={`Key for ${settings.name}`} />
                  </li>
                ))}
              </ul>
            )}
          </li>
          <li>
            {GATE_GLYPHS["gate-bad"]} {settings.feeds.length}{" "}
            {settings.feeds.length === 1 ? "data feed" : "data feeds"} stop
            {settings.feeds.length === 0 ? ` — ${EMPTY_STATES.appNoFeeds.message}` : ""}
          </li>
          <li>{GATE_GLYPHS["gate-bad"]} Try it refuses, in the console, for everyone</li>
          <li>
            {GATE_GLYPHS["gate-off"]} Timeline and audit — every decision, handoff and call
            record — kept
          </li>
        </ul>
        <p className="max-w-prose text-xs text-ink-muted">{SCREEN_NOTES.retireTypeAddress}</p>
      </section>

      <DecisionBar
        idPrefix="app-settings"
        primary={{ label: "Download SDK", disabledReason: DISABLED_REASONS.noContractYet }}
        destructive={{
          label: "Retire app",
          disabledReason:
            settings.status === "retired"
              ? "This app is already retired."
              : DISABLED_REASONS.noWritePathYet,
        }}
      />
    </CoreEdgeShell>
  );
}
