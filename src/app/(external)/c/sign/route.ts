/**
 * POST /c/sign — the irreversible action.
 *
 * Guards (ALL must pass; any failure returns 409 with explicit code):
 *   - session valid (readPresalesSession)
 *   - grant.canSignOff === true  → otherwise SIGNATORY_REQUIRED
 *   - bundle.revokedAt IS NULL
 *   - bundle.signedAt IS NULL (also rechecked atomically in the UPDATE)
 *   - NOW <= bundle.expiresAt + 5 min grace
 *   - per-device OTP verified
 *   - CSRF nonce verified
 *
 * Atomic signoff:
 *   prisma.presalesBundle.updateMany({
 *     where: { id, signedAt: null, revokedAt: null },
 *     data: { signedAt, signedByGrantId, signedDecisionsJson, signedWithinGrace }
 *   })
 *   count === 1 → first writer; proceeds with PDF + emails.
 *   count === 0 → race lost; another tab/device signed first; return 409
 *                 BUNDLE_ALREADY_SIGNED.
 *
 * Open items: scopes/decisions without a current row are recorded in
 * signedDecisionsJson as { choice: 'open' } — surfaced in the PDF as
 * "No position taken — for resolution in Explore phase". NEVER as
 * implicit standard adoption.
 *
 * After successful UPDATE:
 *   1. Call /api/presales/sign-pdf to render + upload PDF.
 *   2. Persist signedPdfBlobUrl + signedPdfHash on the bundle.
 *   3. Dispatch signoff-confirm email to signatory (bestEffort=false).
 *   4. Dispatch pdf-delivery email to consultant (bestEffort=true).
 *   5. Write signoff_completed, pdf_generated, pdf_emailed audit rows.
 *
 * If PDF or email fails AFTER the UPDATE has committed, the bundle stays
 * signed (signoff is the contract; email is notification). The failure is
 * audited and surfaced on the SIGNED page as a banner so the user can
 * request a re-send.
 */

import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { verifySessionNonce } from '@/lib/presales/csrf';
import {
  dispatchEmail,
  renderPdfDeliveryEmail,
  renderSignoffConfirmEmail,
} from '@/lib/presales/emails';
import { readPresalesSession } from '@/lib/presales/session';
import { hashUserAgent } from '@/lib/presales/ua-fingerprint';
import type { ScopeItemContent } from '@/lib/fts/types';

const GRACE_MS = 5 * 60 * 1000;

function conflict(code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: 409 });
}

function clientIp(hdrs: Headers): string | null {
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    null
  );
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

interface SignedDecisionLite {
  scopeCode: string;
  decisionId: string;
  choice: string;
  notes: string;
  setByGrantId: string | null;
  rowId: string | null;
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
      attemptedPath: '/c/sign',
    });
    return conflict('SESSION_INVALID', 'Session is not active.');
  }

  const form = await req.formData().catch(() => null);
  const csrf = form ? String(form.get('csrf') ?? '') : '';
  if (!verifySessionNonce(resolved.session.id, csrf)) {
    return conflict('CSRF_INVALID', 'Form session token did not validate.');
  }

  if (!resolved.grant.canSignOff) {
    return conflict(
      'SIGNATORY_REQUIRED',
      'Only the designated signatory can complete signoff.',
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
        payload: { reason: 'otp_bypass_attempt', uaHash, attemptedPath: '/c/sign' },
      },
    });
    return conflict('OTP_REQUIRED', 'Device OTP verification required before signoff.');
  }

  // Bundle lifecycle guards.
  const now = new Date();
  if (resolved.bundle.revokedAt) return conflict('BUNDLE_REVOKED', 'Bundle has been revoked.');
  if (resolved.bundle.signedAt) {
    return conflict('BUNDLE_ALREADY_SIGNED', 'This bundle has already been signed.');
  }

  // 5-minute grace window past expiresAt.
  const expiryWithGrace = new Date(resolved.bundle.expiresAt.getTime() + GRACE_MS);
  if (now > expiryWithGrace) {
    return conflict('BUNDLE_EXPIRED', 'Bundle window has closed; signoff no longer available.');
  }
  const withinGrace = now > resolved.bundle.expiresAt;

  // Build the frozen signedDecisionsJson: latest non-superseded row per
  // (scopeCode, decisionId), filling "open" for missing entries from the
  // snapshot. Open items appear as "No position taken — for resolution in
  // Explore phase" in the PDF (never as implicit standard adoption).
  const rows = await prisma.presalesBundleDecision.findMany({
    where: { bundleId: resolved.bundle.id, supersededAt: null },
    orderBy: { setAt: 'desc' },
  });
  const stateByKey = new Map<string, { row: typeof rows[number] }>();
  for (const r of rows) {
    const key = `${r.scopeCode}|${r.decisionId}`;
    if (stateByKey.has(key)) continue;
    stateByKey.set(key, { row: r });
  }

  const snapshot = resolved.bundle.contentSnapshotJson as unknown as ScopeItemContent[];
  const decisionsByScope: Record<string, SignedDecisionLite[]> = {};
  for (const scopeCode of resolved.bundle.scopeCodes) {
    const snap = Array.isArray(snapshot) ? snapshot.find((s) => s?.code === scopeCode) : null;
    const list: SignedDecisionLite[] = [];
    for (const d of snap?.decisions ?? []) {
      const state = stateByKey.get(`${scopeCode}|${d.id}`);
      if (state) {
        list.push({
          scopeCode,
          decisionId: d.id,
          choice: state.row.choice,
          notes: state.row.notes,
          setByGrantId: state.row.setByGrantId,
          rowId: state.row.id,
        });
      } else {
        list.push({
          scopeCode,
          decisionId: d.id,
          choice: 'open',
          notes: '',
          setByGrantId: null,
          rowId: null,
        });
      }
    }
    decisionsByScope[scopeCode] = list;
  }

  // Atomic UPDATE — first writer wins. updateMany returns the rows
  // matched count; we exploit the WHERE signedAt IS NULL invariant.
  const update = await prisma.presalesBundle.updateMany({
    where: { id: resolved.bundle.id, signedAt: null, revokedAt: null },
    data: {
      signedAt: now,
      signedByGrantId: resolved.grant.id,
      signedDecisionsJson: decisionsByScope as unknown as object,
      signedWithinGrace: withinGrace,
    },
  });
  if (update.count === 0) {
    return conflict('BUNDLE_ALREADY_SIGNED', 'Another writer won the signoff race.');
  }

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: resolved.bundle.id,
      grantId: resolved.grant.id,
      eventType: 'signoff_completed',
      ip,
      userAgent: ua.slice(0, 512),
      payload: {
        signedAt: now.toISOString(),
        signedWithinGrace: withinGrace,
        scopeCount: resolved.bundle.scopeCodes.length,
      },
    },
  });

  // Best-effort PDF generation. Failure does NOT undo the signoff (the
  // bundle has already transitioned to signed state). The SIGNED page
  // detects a missing PDF and surfaces a "re-generate" affordance.
  let pdfUrl: string | null = null;
  let pdfHash: string | null = null;
  let pdfBytes: Buffer | null = null;
  try {
    const internalSecret = process.env.PRESALES_INTERNAL_SECRET ?? '';
    const origin = req.nextUrl.origin;
    const pdfRes = await fetch(`${origin}/api/presales/sign-pdf`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-presales-internal-secret': internalSecret,
      },
      body: JSON.stringify({ bundleId: resolved.bundle.id }),
    });
    if (pdfRes.ok) {
      const pdfJson = (await pdfRes.json()) as {
        blobUrl: string;
        sha256: string;
        sizeBytes: number;
      };
      pdfUrl = pdfJson.blobUrl;
      pdfHash = pdfJson.sha256;

      // Fetch the bytes for email attachments. Data URLs are decoded
      // locally; blob URLs are fetched.
      if (pdfUrl.startsWith('data:')) {
        const base64 = pdfUrl.split(',')[1] ?? '';
        pdfBytes = Buffer.from(base64, 'base64');
      } else {
        const r = await fetch(pdfUrl);
        if (r.ok) {
          pdfBytes = Buffer.from(await r.arrayBuffer());
        }
      }

      await prisma.presalesBundle.update({
        where: { id: resolved.bundle.id },
        data: { signedPdfBlobUrl: pdfUrl, signedPdfHash: pdfHash },
      });

      await prisma.presalesAuditEvent.create({
        data: {
          bundleId: resolved.bundle.id,
          grantId: resolved.grant.id,
          eventType: 'pdf_generated',
          payload: { sha256: pdfHash, sizeBytes: pdfJson.sizeBytes },
        },
      });
    }
  } catch (err) {
    console.warn('[presales-sign] PDF generation failed:', err);
  }

  // Email dispatch. Both attach the PDF when available; if not, we send
  // a no-attachment notice and write a degraded audit row.
  if (pdfBytes) {
    const hashShort = (pdfHash ?? '').slice(0, 12);
    try {
      const signatoryResult = await dispatchEmail(
        renderSignoffConfirmEmail({
          signatoryEmail: resolved.grant.email,
          signatoryName: resolved.grant.displayName ?? resolved.grant.email,
          clientCompanyName: resolved.bundle.clientCompanyName,
          signedAtIso: now.toISOString(),
          documentHashShort: hashShort,
          bundleReference: resolved.bundle.id,
          pdf: pdfBytes,
        }),
        { bestEffort: false },
      );
      await prisma.presalesAuditEvent.create({
        data: {
          bundleId: resolved.bundle.id,
          grantId: resolved.grant.id,
          eventType: 'pdf_emailed',
          payload: {
            to: 'signatory',
            email: resolved.grant.email,
            delivered: signatoryResult.delivered,
            messageId: signatoryResult.messageId,
          },
        },
      });
    } catch (err) {
      await prisma.presalesAuditEvent.create({
        data: {
          bundleId: resolved.bundle.id,
          grantId: resolved.grant.id,
          eventType: 'pdf_emailed',
          payload: { to: 'signatory', email: resolved.grant.email, delivered: false, error: String(err) },
        },
      });
    }

    const creator = await prisma.user.findUnique({ where: { id: resolved.bundle.createdBy } });
    if (creator?.email) {
      const internalResult = await dispatchEmail(
        renderPdfDeliveryEmail({
          consultantEmail: creator.email,
          consultantName: creator.name ?? creator.email,
          clientCompanyName: resolved.bundle.clientCompanyName,
          signatoryName: resolved.grant.displayName ?? resolved.grant.email,
          signatoryEmail: resolved.grant.email,
          signedAtIso: now.toISOString(),
          documentHashShort: hashShort,
          bundleReference: resolved.bundle.id,
          pdf: pdfBytes,
        }),
        { bestEffort: true },
      );
      await prisma.presalesAuditEvent.create({
        data: {
          bundleId: resolved.bundle.id,
          grantId: resolved.grant.id,
          eventType: 'pdf_emailed',
          payload: {
            to: 'consultant',
            email: creator.email,
            delivered: internalResult.delivered,
            messageId: internalResult.messageId,
          },
        },
      });
    }
  }

  // Land on the SIGNED state page (first scope by default).
  return NextResponse.redirect(
    new URL(
      `/c/s/${encodeURIComponent(resolved.bundle.defaultScopeCode)}/signed`,
      req.url,
    ),
    { status: 303 },
  );
}
