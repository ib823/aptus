/**
 * /api/studio/interfaces/[id]/query-policy — an interface's query policy
 * (P1.4, 3.5.7 and 3.15): what callers may select, filter, sort, look up by
 * key and page through on its /data route.
 *
 *   GET     the basis (the current contract's fields, as a query may use
 *           them), the builder's source, a summary of the compiled policy
 *           callers are held to, and the safe default "Enable queries" saves.
 *           Anyone who can open Studio.
 *   PUT     save a source: compiled against the basis under the row lock,
 *           refused when it does not compile. Builders only.
 *   DELETE  remove the policy: every query call then answers
 *           QUERY_NOT_AVAILABLE, and open paging cursors stop with it.
 *
 * THIS ROUTE IS THE ONLY WRITER OF THE SOURCE. The interfaces PATCH does not
 * accept it (the `mappingVersion` precedent), so every saved policy has been
 * compiled against the basis stored beside it, by the same function a verify
 * uses (policy-compiler.ts), in SAVE mode: anything the contract does not
 * allow refuses the save, one sentence per problem. A verify later NARROWS
 * instead, because nobody is there to fix it (D9).
 *
 * COMPARE-AND-SET. The card sends the revision and the basis it was drawn
 * from. A save that finds either moved (another builder saved, or a verify
 * rewrote the basis) is refused 409, and the builder reloads: a policy is
 * never compiled against a contract its builder did not see. The interface
 * row is locked first (policy-store.ts lockQueryPolicyRow), which orders a
 * save with a verify running beside it.
 *
 * A POLICY ONLY NARROWS WHAT THE GRANT APPROVED, so a builder edits it alone
 * (D10), and an edit never bumps Interface.version: a bump would clear the
 * captured schema and fixtures, and paging cursors bind the policy's `rev`
 * instead. Every save is in the config audit, as PROMOTE when it widens what
 * bulk reading allows (a row cap above 10,000, a maximum page above 500, the
 * total count turned on) and UPDATE otherwise, with what it widened and
 * narrowed (3.5.8). A save that narrows an ACTIVE interface is answered with
 * what callers would lose and written only once the builder confirms it:
 * those callers start receiving 400 POLICY_FIELD_NOT_GRANTED.
 *
 * NO STEP-UP. A query policy decides which of the fields an approved grant
 * already covers a caller may filter and sort on; it reaches no SAP system
 * and approves nothing, so it is not one of step-up.ts's governance actions.
 *
 * Not a governed call: no northbound audit row and no statement budget. The
 * Studio mutation bucket (middleware) throttles the PUT and DELETE.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { querySurfaceEnabled } from "@/lib/northbound/query/surface";
import { parseQueryBasis } from "@/lib/odata/basis";
import { parseCompiledPolicy, parseQueryPolicySource, STALE_REASONS, type PolicyError } from "@/lib/odata/policy";
import { compileQueryPolicy, policyChange } from "@/lib/odata/policy-compiler";
import { lockQueryPolicyRow, writeCompiledQueryPolicy } from "@/lib/odata/policy-store";
import { newCorrelationId } from "@/lib/northbound/respond";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { compiledSummary, suggestedQueryPolicy } from "@/lib/studio/query-policy";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

/** The PUT body, at most: a 32 KiB source and the compare-and-set beside it. */
const MAX_BODY_BYTES = 40 * 1024;

const RELOAD = "The query policy or the service's contract changed while you were editing. Reload, then make your change again.";
const VERIFY_FIRST = "Verify the service to describe its fields before offering queries.";
const READ_ONLY = "Queries are served on read interfaces only.";

const putSchema = z.strictObject({
  source: z.unknown(),
  expected: z.strictObject({
    revision: z.number().int().min(0),
    basisHash: z.string().min(1).max(128),
  }),
  /** The builder saw what this save takes away from callers of an ACTIVE interface, and confirmed it. */
  confirmNarrowing: z.boolean().optional(),
});

const deleteSchema = z.strictObject({
  expected: z.strictObject({ revision: z.number().int().min(0) }),
});

type Gate =
  | { ok: true; user: { id: string; role: string }; scope: TenantScope }
  | { ok: false; response: NextResponse };

async function gate(mutate: boolean): Promise<Gate> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: studioError("UNAUTHENTICATED", "Sign in required.") };
  if (!canAccessStudio(user.role)) return { ok: false, response: studioError("FORBIDDEN", "Developer Studio is role-gated.") };
  if (mutate && !canMutateStudio(user.role)) {
    return { ok: false, response: studioError("FORBIDDEN", "Your role can view this interface's query policy but not change it.") };
  }
  if (lacksStudioTenantScope(user)) return { ok: false, response: studioError("FORBIDDEN", "No organization scope.") };
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return { ok: false, response: studioError("FORBIDDEN", "No organization scope.") };
  return { ok: true, user: { id: user.id, role: user.role }, scope: scoped.scope };
}

/** A refused save: one sentence per problem in the message, and the list for the card. */
function refusedSave(errors: readonly PolicyError[]): NextResponse {
  const correlationId = newCorrelationId();
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: errors.map((e) => e.message).join(" "),
        correlationId,
        errors: errors.map((e) => ({ ...(e.field === undefined ? {} : { field: e.field }), rule: e.rule, message: e.message })),
      },
    },
    { status: 400, headers: { "x-correlation-id": correlationId } },
  );
}

async function readBody(request: NextRequest): Promise<unknown> {
  const text = await request.text().catch(() => null);
  if (text === null || Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const INTERFACE_SELECT = {
  id: true,
  operation: true,
  status: true,
  version: true,
  entitySet: true,
  odataVersion: true,
  queryPolicy: true,
  queryBasis: true,
  queryPolicyCompiled: true,
  queryPolicyRevision: true,
} as const;

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(false);
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({ where: scopedById(g.scope, id), select: INTERFACE_SELECT });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");
  if (iface.operation !== "READ") return studioError("VALIDATION_ERROR", READ_ONLY);

  const basis = parseQueryBasis(iface.queryBasis);
  const source = iface.queryPolicy === null ? null : parseQueryPolicySource(iface.queryPolicy);
  return studioOk({
    interfaceId: iface.id,
    interfaceStatus: iface.status,
    basis,
    /** What the card sends back as `expected.basisHash`. */
    basisHash: basis?.snapshot.contentHash ?? null,
    source: source !== null && source.ok ? source.source : null,
    /** A source on the row that no longer validates (it was not written here): shown as needing a new save. */
    sourceUnreadable: source !== null && !source.ok,
    compiled: compiledSummary(iface.queryPolicyCompiled),
    revision: iface.queryPolicyRevision,
    flagEnabled: querySurfaceEnabled(),
    canEdit: canMutateStudio(g.user.role),
    suggested: basis === null ? null : suggestedQueryPolicy(basis),
  });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(true);
  if (!g.ok) return g.response;
  const { scope, user } = g;
  const parsedBody = putSchema.safeParse(await readBody(request));
  if (!parsedBody.success) {
    return studioError("VALIDATION_ERROR", "Send the policy as { source, expected: { revision, basisHash } }, at most 40 KiB.");
  }
  const { expected, confirmNarrowing } = parsedBody.data;
  const parsedSource = parseQueryPolicySource(parsedBody.data.source);
  if (!parsedSource.ok) return refusedSave(parsedSource.errors);
  const source = parsedSource.source;

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({ where: scopedById(scope, id), select: { id: true, operation: true, status: true } });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");
  if (iface.operation !== "READ") return studioError("VALIDATION_ERROR", READ_ONLY);

  type Outcome =
    | { kind: "conflict"; message: string }
    | { kind: "refused"; errors: readonly PolicyError[] }
    | { kind: "confirm"; widened: readonly string[]; narrowed: readonly string[] }
    | {
        kind: "saved";
        revision: number;
        before: { rev: string | null; revision: number };
        compiled: unknown;
        rev: string;
        state: string;
        widened: readonly string[];
        narrowed: readonly string[];
        warnings: readonly string[];
      };

  const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
    const row = await lockQueryPolicyRow(tx, scope.organizationId, iface.id);
    if (!row) return { kind: "conflict", message: RELOAD };
    const basis = parseQueryBasis(row.queryBasis);
    if (basis === null) return { kind: "conflict", message: VERIFY_FIRST };
    if (row.queryPolicyRevision !== expected.revision || basis.snapshot.contentHash !== expected.basisHash) {
      return { kind: "conflict", message: RELOAD };
    }
    const previousParsed = parseCompiledPolicy(row.queryPolicyCompiled);
    const previous = "unreadable" in previousParsed ? null : previousParsed.compiled;
    const revision = row.queryPolicyRevision + 1;
    const odataVersion = row.odataVersion === "V2" || row.odataVersion === "V4" ? row.odataVersion : null;
    const compiled = compileQueryPolicy(source, basis, {
      mode: "save",
      interface: { entitySet: row.entitySet, odataVersion },
      revision,
      now: new Date(),
      previous,
    });
    if (!compiled.ok) {
      // A contract no query can be offered on is not the builder's choice to fix here.
      const stale = compiled.errors.find((e) => (STALE_REASONS as readonly string[]).includes(e.rule));
      if (stale) return { kind: "conflict", message: `${stale.message} ${VERIFY_FIRST}` };
      return { kind: "refused", errors: compiled.errors };
    }
    const change = policyChange(previous, compiled.compiled);
    if (iface.status === "ACTIVE" && change.narrowed.length > 0 && confirmNarrowing !== true) {
      return { kind: "confirm", widened: change.widened, narrowed: change.narrowed };
    }
    await writeCompiledQueryPolicy(tx, scope.organizationId, iface.id, { revision, compiled: compiled.compiled, source });
    return {
      kind: "saved",
      revision,
      before: { rev: previous?.rev ?? null, revision: row.queryPolicyRevision },
      compiled: compiled.compiled,
      rev: compiled.compiled.rev,
      state: compiled.compiled.state,
      widened: change.widened,
      narrowed: change.narrowed,
      warnings: compiled.warnings,
    };
  });

  if (outcome.kind === "conflict") return studioError("CONFLICT", outcome.message);
  if (outcome.kind === "refused") return refusedSave(outcome.errors);
  if (outcome.kind === "confirm") {
    return studioOk({
      saved: false as const,
      confirm: {
        widened: outcome.widened,
        narrowed: outcome.narrowed,
        message: "Callers using these fields or operators will receive 400 POLICY_FIELD_NOT_GRANTED.",
      },
    });
  }

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    // Bulk-relevant widenings are recorded as PROMOTE, so the trail can be
    // filtered for them (3.5.8); whether they need a second person is D10.
    action: outcome.widened.length > 0 ? "PROMOTE" : "UPDATE",
    before: outcome.before,
    after: {
      event: "query_policy_save",
      rev: outcome.rev,
      revision: outcome.revision,
      state: outcome.state,
      widened: outcome.widened,
      narrowed: outcome.narrowed,
      source,
    },
  });

  return studioOk({
    saved: true as const,
    revision: outcome.revision,
    compiled: compiledSummary(outcome.compiled),
    widened: outcome.widened,
    narrowed: outcome.narrowed,
    warnings: outcome.warnings,
  });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(true);
  if (!g.ok) return g.response;
  const { scope, user } = g;
  const parsedBody = deleteSchema.safeParse(await readBody(request));
  if (!parsedBody.success) return studioError("VALIDATION_ERROR", "Send { expected: { revision } } to remove the query policy.");
  const { expected } = parsedBody.data;

  const { id } = await ctx.params;
  const iface = await prisma.interface.findFirst({ where: scopedById(scope, id), select: { id: true, operation: true } });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");
  if (iface.operation !== "READ") return studioError("VALIDATION_ERROR", READ_ONLY);

  const outcome = await prisma.$transaction(async (tx) => {
    const row = await lockQueryPolicyRow(tx, scope.organizationId, iface.id);
    if (!row || row.queryPolicyRevision !== expected.revision) return { kind: "conflict" as const };
    if (row.queryPolicy === null && row.queryPolicyCompiled === null) return { kind: "absent" as const, revision: row.queryPolicyRevision };
    const previous = parseCompiledPolicy(row.queryPolicyCompiled);
    const revision = row.queryPolicyRevision + 1;
    await writeCompiledQueryPolicy(tx, scope.organizationId, iface.id, { revision, compiled: null, source: null });
    return {
      kind: "removed" as const,
      revision,
      before: { rev: "unreadable" in previous ? null : previous.compiled.rev, revision: row.queryPolicyRevision },
    };
  });

  if (outcome.kind === "conflict") return studioError("CONFLICT", RELOAD);
  if (outcome.kind === "absent") return studioOk({ removed: false as const, revision: outcome.revision });

  await writeConfigAudit({
    organizationId: scope.organizationId,
    actorId: user.id,
    entityType: "Interface",
    entityId: iface.id,
    action: "UPDATE",
    before: outcome.before,
    after: { event: "query_policy_remove", rev: null, revision: outcome.revision },
  });
  return studioOk({ removed: true as const, revision: outcome.revision });
}
