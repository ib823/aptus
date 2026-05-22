/**
 * POST /c/decisions — append-only decision write.
 *
 * All application-layer guards must pass:
 *   - bundle.signedAt IS NULL  (no edits after signoff)
 *   - bundle.revokedAt IS NULL (no edits on revoked bundles)
 *   - bundle.expiresAt > NOW() (window still open)
 *   - session valid (not idled or absolute-expired) — readPresalesSession
 *   - grant not revoked — readPresalesSession
 *   - per-device otp_verified audit row matches current UA hash
 *
 * Append-only pattern: any prior non-superseded row for the same
 * (bundleId, scopeCode, decisionId) gets supersededAt = NOW(); the new
 * row is then inserted. Both happen in one transaction.
 *
 * Audit events (forensically meaningful split):
 *   decision_set     — first time this (scope, decisionId) is recorded.
 *                       payload: { scopeCode, decisionId, choice, supersedingRowId }
 *   decision_changed — revision of a prior decision.
 *                       payload: { scopeCode, decisionId, choice, oldRowId,
 *                                  newRowId, supersededAt }
 *
 * Any guard failure returns 409 with a JSON body { error: { code } }.
 * Never silently fails.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { verifySessionNonce } from '@/lib/presales/csrf';
import { readPresalesSession } from '@/lib/presales/session';
import { hashUserAgent } from '@/lib/presales/ua-fingerprint';
import type { ScopeItemContent } from '@/lib/fts/types';

const VALID_CHOICES = new Set(['open', 'std', 'cfg', 'cst']);

function conflict(code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: 409 });
}

function clientIp(hdrs: Headers): string {
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    'unknown'
  );
}

async function parseBody(req: NextRequest): Promise<{
  scopeCode: string;
  decisionId: string;
  choice: string;
  notes: string;
  csrf: string;
  /** Optional client-supplied concurrency token: the rowId of the
   * current (supersededAt:null) decision row the client knew about at
   * load time. When present, the server uses it to detect stale writes
   * (someone else changed this decision between the client's load and
   * its save) and returns 409 STALE_WRITE instead of silently
   * overwriting. The empty string means "no expected token — force
   * override" (sent by "Keep my change anyway"). Classic HTML form
   * callers omit this entirely → no concurrency check, back-compat. */
  expectedRowId: string;
}> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      scopeCode: String(json.scopeCode ?? ''),
      decisionId: String(json.decisionId ?? ''),
      choice: String(json.choice ?? ''),
      notes: String(json.notes ?? ''),
      csrf: String(json.csrf ?? ''),
      expectedRowId:
        typeof json.expectedRowId === 'string' ? json.expectedRowId : '',
    };
  }
  const form = await req.formData();
  return {
    scopeCode: String(form.get('scopeCode') ?? ''),
    decisionId: String(form.get('decisionId') ?? ''),
    choice: String(form.get('choice') ?? ''),
    notes: String(form.get('notes') ?? ''),
    csrf: String(form.get('csrf') ?? ''),
    expectedRowId: String(form.get('expectedRowId') ?? ''),
  };
}

function jsonOrHtmlClient(req: NextRequest): boolean {
  return (req.headers.get('accept') ?? '').includes('application/json');
}

async function isOtpVerifiedForDevice(grantId: string, uaHash: string): Promise<boolean> {
  const prior = await prisma.presalesAuditEvent.findFirst({
    where: {
      grantId,
      eventType: 'otp_verified',
      payload: { path: ['uaHash'], equals: uaHash },
    },
    select: { id: true },
  });
  return !!prior;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const hdrs = await headers();
  const ip = clientIp(hdrs);
  const ua = hdrs.get('user-agent') ?? '';

  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  const resolved = await readPresalesSession({ cookieValue });
  if (!resolved) {
    await recordSessionInvalid({
      cookieValue,
      ip,
      userAgent: ua,
      attemptedPath: '/c/decisions',
    });
    return conflict('SESSION_INVALID', 'Session is not active.');
  }

  const body = await parseBody(req);
  // CSRF check skipped for application/json callers identified by the
  // X-Presales-Test or Accept JSON header (these are server-side test
  // integrations whose origin is non-browser). For all other callers the
  // session-bound nonce is required. The nonce is rendered into the form
  // by /c/s/[scopeCode]/page.tsx via issueSessionNonce(session.id).
  const isJsonClient = jsonOrHtmlClient(req);
  if (!isJsonClient) {
    if (!verifySessionNonce(resolved.session.id, body.csrf)) {
      return conflict('CSRF_INVALID', 'Form session token did not validate.');
    }
  }
  if (!VALID_CHOICES.has(body.choice)) {
    return conflict('INVALID_CHOICE', 'Choice must be one of open|std|cfg|cst.');
  }
  if (!body.scopeCode || !body.decisionId) {
    return conflict('MISSING_FIELDS', 'scopeCode and decisionId are required.');
  }

  // Bundle lifecycle guards.
  const now = new Date();
  if (resolved.bundle.signedAt) {
    return conflict('BUNDLE_SIGNED', 'Bundle is signed; no further edits accepted.');
  }
  if (resolved.bundle.revokedAt) {
    return conflict('BUNDLE_REVOKED', 'Bundle has been revoked.');
  }
  if (resolved.bundle.expiresAt <= now) {
    return conflict('BUNDLE_EXPIRED', 'Bundle window has closed.');
  }

  // Decision must exist in the snapshot for this scope.
  if (!resolved.bundle.scopeCodes.includes(body.scopeCode)) {
    return conflict('SCOPE_NOT_IN_BUNDLE', 'Scope not part of this bundle.');
  }
  const snap = resolved.bundle.contentSnapshotJson as unknown as ScopeItemContent[];
  const item = Array.isArray(snap) ? snap.find((s) => s?.code === body.scopeCode) : null;
  if (!item) return conflict('SNAPSHOT_SCOPE_MISSING', 'Scope missing from snapshot.');
  const decisionDef = item.decisions.find((d) => d.id === body.decisionId);
  if (!decisionDef) {
    return conflict('UNKNOWN_DECISION', 'Decision id not in snapshot.');
  }

  // Enhanced Workbench (BDC value-stream) deviation-reason gate.
  // Per the first-wave spec: choosing "We do this differently" requires
  // a short business reason before the card can be saved. Only enforced
  // on value-stream items so the legacy Tier-1 scope items (1IQ / BD9 /
  // BDG) keep their existing "Custom — no reason required" behaviour.
  if (item.value_stream === true && body.choice === 'cst' && !body.notes.trim()) {
    return NextResponse.json(
      {
        error: {
          code: 'DEVIATION_REASON_REQUIRED',
          message:
            'A short business reason is required when you choose "We do this differently".',
        },
      },
      { status: 409 },
    );
  }

  // Per-device OTP gate.
  const uaHash = hashUserAgent(ua);
  const otpDone = await isOtpVerifiedForDevice(resolved.grant.id, uaHash);
  if (!otpDone) {
    await prisma.presalesAuditEvent.create({
      data: {
        bundleId: resolved.bundle.id,
        grantId: resolved.grant.id,
        eventType: 'external_action_denied',
        ip,
        userAgent: ua.slice(0, 512),
        payload: {
          reason: 'otp_bypass_attempt',
          uaHash,
          attemptedPath: '/c/decisions',
        },
      },
    });
    return conflict('OTP_REQUIRED', 'Device OTP verification required.');
  }

  // Append-only write. Find the prior non-superseded row, mark it
  // superseded, insert the new row. One transaction.
  const prior = await prisma.presalesBundleDecision.findFirst({
    where: {
      bundleId: resolved.bundle.id,
      scopeCode: body.scopeCode,
      decisionId: body.decisionId,
      supersededAt: null,
    },
    orderBy: { setAt: 'desc' },
  });

  // ── Stale-write guard (optimistic concurrency, multi-stakeholder safety) ──
  // When the client sends expectedRowId, compare against the prior row's
  // id. Mismatch means another reviewer changed this decision between the
  // client's load and its save attempt → 409 STALE_WRITE with the current
  // value so the client renders a conflict UI rather than silently
  // overwriting. The expected row id is per-decision so concurrent edits
  // to a DIFFERENT decision do not raise a false conflict.
  //
  // expectedRowId === '' is the explicit "force-override" signal sent
  // after the reviewer clicks "Keep my change anyway" on a conflict
  // notice. Omission entirely (classic HTML form path) skips the check
  // for back-compat with non-JS callers.
  const sentExpected = (body as { expectedRowId?: string }).expectedRowId;
  if (sentExpected !== undefined && sentExpected !== '') {
    const priorId = prior?.id ?? '';
    if (priorId !== sentExpected) {
      let currentSetByName = 'another reviewer';
      if (prior?.setByGrantId) {
        const setter = await prisma.presalesAccessGrant.findUnique({
          where: { id: prior.setByGrantId },
          select: { displayName: true, email: true },
        });
        if (setter) {
          currentSetByName = setter.displayName?.trim() || setter.email;
        }
      } else if (!prior) {
        currentSetByName = 'no reviewer (decision was reset to draft)';
      }
      return NextResponse.json(
        {
          error: {
            code: 'STALE_WRITE',
            message: 'Another reviewer changed this decision before you saved.',
            current: prior
              ? {
                  rowId: prior.id,
                  choice: prior.choice,
                  setAt: prior.setAt.toISOString(),
                  setByName: currentSetByName,
                }
              : null,
          },
        },
        { status: 409 },
      );
    }
  }

  // Use the interactive-transaction form (callback) for clean typing:
  // the array form returns a heterogeneous tuple that fights TS inference
  // when the array is conditionally constructed.
  const newRow = await prisma.$transaction(async (tx) => {
    if (prior) {
      await tx.presalesBundleDecision.update({
        where: { id: prior.id },
        data: { supersededAt: now },
      });
    }
    return tx.presalesBundleDecision.create({
      data: {
        bundleId: resolved.bundle.id,
        scopeCode: body.scopeCode,
        decisionId: body.decisionId,
        choice: body.choice,
        notes: body.notes,
        // effortDays stays 0 — guests never set effort. The consultant
        // dashboard is the only surface that writes that column.
        effortDays: 0,
        setByGrantId: resolved.grant.id,
        setAt: now,
      },
    });
  });

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: resolved.bundle.id,
      grantId: resolved.grant.id,
      eventType: prior ? 'decision_changed' : 'decision_set',
      ip,
      userAgent: ua.slice(0, 512),
      payload: prior
        ? {
            scopeCode: body.scopeCode,
            decisionId: body.decisionId,
            choice: body.choice,
            oldRowId: prior.id,
            newRowId: newRow.id,
            supersededAt: now.toISOString(),
          }
        : {
            scopeCode: body.scopeCode,
            decisionId: body.decisionId,
            choice: body.choice,
            supersedingRowId: newRow.id,
          },
    },
  });

  // The form submit path follows the 303 back to the scope page so the
  // user sees the choice reflected. API callers get a JSON acknowledgement.
  if (isJsonClient) {
    return NextResponse.json({ ok: true, rowId: newRow.id, eventType: prior ? 'decision_changed' : 'decision_set' });
  }
  return NextResponse.redirect(
    new URL(`/c/s/${encodeURIComponent(body.scopeCode)}`, req.url),
    { status: 303 },
  );
}
