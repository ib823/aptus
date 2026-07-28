/**
 * GET /api/control-tower/connections — the connection register.
 *
 * NOT THE SAME SCREEN AS OPERATIONS' CONNECTION HEALTH, and the difference is
 * the point. Operations asks "is it answering right now"; this asks "is it
 * governed" — who may write through it, which landscape it claims to be, and
 * whether a secret was ever sealed for it. So this one includes DEACTIVATED
 * connections, which Operations deliberately excludes: a deactivated connection
 * serves no traffic and has no health worth reporting, but it is still part of
 * the estate someone is accountable for.
 *
 * SEALED-SECRET PRESENCE IS A BOOLEAN AND NOTHING MORE. `secretsCiphertext` is
 * counted, never selected, so no field in this response could become a
 * credential. The same is true of `baseUrl` and `oauthTokenUrl` — a SAP hostname
 * is not a secret exactly, but it is estate detail a governance view has no need
 * for, and the cheapest way to never leak it is never to read it.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";
import { deploymentFallbackTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const where = opsWhere(guard.actor, {});

  const rows = await prisma.sapConnection.findMany({
      where,
      select: {
        id: true,
        product: true,
        key: true,
        label: true,
        environment: true,
        authType: true,
        writeEnabled: true,
        isActive: true,
        lastValidationStatus: true,
        lastValidatedAt: true,
        createdAt: true,
        // baseUrl, oauthTokenUrl and secretsCiphertext are NOT selected.
      },
      orderBy: [{ isActive: "desc" }, { product: "asc" }, { key: "asc" }],
  });

  // The deployment's shared tenants are in use exactly when this organization
  // has stored none — the broker's own fallback rule. A governance register that
  // said "no connection in the estate" while the deployment was reaching SAP
  // would be recording a fiction about the thing it exists to record.
  const fallback = rows.filter((r) => r.isActive).length === 0 ? deploymentFallbackTenants() : [];

  const active = rows.filter((r) => r.isActive);
  const writeEnabled = active.filter((r) => r.writeEnabled);
  const undeclared = active.filter((r) => !r.environment || r.environment.trim().length === 0);
  const prod = active.filter((r) => r.environment?.trim().toUpperCase() === "PROD");

  return studioOk({
    scope: guard.actor.kind,
    counts: {
      total: rows.length,
      active: active.length,
      inactive: rows.length - active.length,
      writeEnabled: writeEnabled.length,
      prod: prod.length,
      undeclaredEnvironment: undeclared.length,
      // NOT a "has a sealed secret" count. `SapConnection.secretsCiphertext` is
      // a REQUIRED column, so such a count could only ever equal the total — a
      // tile that cannot vary is not a measurement, it is decoration that looks
      // like one. The guarantee is stated in provenance instead, where it is
      // both true and stronger.
    },
    /**
     * Actions that exist and cannot be invoked from here.
     *
     * Enabling or revoking write on a connection is a real capability, gated to
     * the CONSULTANT role — so `platform_admin`, this workspace's owner, gets a
     * 403. Deleting the control from the screen would hide a capability from the
     * person doing oversight; wiring it live would ship a button that fails for
     * the only role that can reach it. Named here so the UI can render it
     * visible-but-disabled and say where the action lives.
     */
    delegatedActions: [
      {
        id: "connection-write-enablement",
        label: "Enable or revoke write",
        availableTo: "consultant",
        where: "Developer Studio → Connections",
        why: "Write-enablement is a builder's action on their own solution's connection. Control Tower observes it; it does not perform it.",
      },
    ],
    deploymentFallback: {
      inUse: fallback.length > 0,
      tenants: fallback.map((t2) => ({
        key: t2.key,
        label: t2.label,
        product: t2.product,
        environment: t2.environment,
        source: t2.source,
      })),
    },
    provenance: {
      fallbackIsShared:
        fallback.length > 0
          ? "This organization has stored no SAP connection, so traffic falls back to the deployment's configured tenant. That tenant is shared by every organization on this deployment — it is governed at the deployment level, not here, and it has no per-connection owner, write flag or sealed secret."
          : null,
      includesInactive:
        "Unlike the Operations Center's health view, deactivated connections ARE listed here. They serve no traffic, so they have no health worth reporting — but they remain part of the estate someone is accountable for.",
      everyConnectionIsSealed:
        "Sealing is not optional and is not reported as a count: secretsCiphertext is a required column, so a connection cannot exist without one. A count would equal the total on every deployment forever, which would look like a measurement and be a constant.",
      secretsAreNeverRead:
        "The ciphertext is not selected by this query, so there is no field in this response that could become a credential. The SAP hostname and OAuth token URL are not read either.",
      environmentGatesWrites:
        "A connection with no declared environment serves reads marked unverified and refuses writes outright. The count is a backlog expected to reach zero.",
      countsAreComplete: "Every connection in scope is listed. There is no sampling and no page.",
    },
    connections: rows.map((r) => ({
      id: r.id,
      product: r.product,
      key: r.key,
      label: r.label,
      environment: r.environment,
      authType: r.authType,
      writeEnabled: r.writeEnabled,
      isActive: r.isActive,
      status: r.lastValidationStatus ?? "NEVER_TESTED",
      neverTested: r.lastValidationStatus === null,
      lastValidatedAt: r.lastValidatedAt ? r.lastValidatedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
