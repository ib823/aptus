/**
 * GET /c/s/[scopeCode] — external workbench main view.
 *
 * THIS IS THE LOAD-BEARING REDACTED SURFACE.
 *
 * Server-rendered. Reads the session cookie, resolves the grant + bundle,
 * gates on OTP-verification state, and loads scope content through
 * getScopeItemForExternal — the only sanctioned external loader. Direct
 * reads of contentSnapshotJson in this code path would be a redaction-layer
 * regression and the integration test will fail the build.
 *
 * Visual treatment is deliberately minimal until the design-system components
 * land in build sequence step 4. The data shape is the contract right now.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { recordSessionInvalid } from '@/lib/presales/audit-session';
import { PRESALES_COOKIE_NAME } from '@/lib/presales/cookies';
import { issueSessionNonce } from '@/lib/presales/csrf';
import {
  getDecisionStatesForExternal,
  getScopeItemForExternal,
  resolveDecisionAttribution,
} from '@/lib/presales/redaction';
import { readPresalesSession } from '@/lib/presales/session';
import { hashUserAgent } from '@/lib/presales/ua-fingerprint';
import { DecisionCardClient } from '@/components/presales/DecisionCardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ scopeCode: string }>;
}

/** Per-device OTP check — payload.uaHash must match current device. */
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

export default async function PresalesScopePage({ params }: PageProps) {
  const { scopeCode } = await params;
  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(PRESALES_COOKIE_NAME)?.value;
  const resolved = await readPresalesSession({ cookieValue });

  const hdrs = await headers();
  const ua = hdrs.get('user-agent') ?? '';
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    null;

  if (!resolved) {
    await recordSessionInvalid({
      cookieValue,
      ip,
      userAgent: ua,
      attemptedPath: `/c/s/${scopeCode}`,
    });
    redirect('/c/expired?reason=session_expired');
  }

  // Per-device OTP gate. The locked decision: client never reaches this
  // page without an otp_verified audit row matching the current device's
  // uaHash. A denial here is interesting — either (a) someone is trying
  // to bypass OTP via direct URL manipulation, or (b) a legit second-device
  // user pasted the URL before finishing /c/verify. We can't distinguish
  // intent at this layer, so we audit every denial as external_action_denied
  // {reason: 'otp_bypass_attempt'}. Consultant sees it on next dashboard
  // load; never a silent redirect on a security gate.
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
          requestedScopeCode: scopeCode,
        },
      },
    });
    redirect('/c/verify');
  }

  if (!resolved.bundle.scopeCodes.includes(scopeCode)) {
    redirect(`/c/s/${encodeURIComponent(resolved.bundle.defaultScopeCode)}`);
  }

  const item = await getScopeItemForExternal(prisma, scopeCode, resolved.bundle.id);
  if (!item) redirect('/c/expired?reason=invalid_token');

  const decisionStates = await getDecisionStatesForExternal(
    prisma,
    scopeCode,
    resolved.bundle.id,
  );

  // ── Multi-stakeholder safety: attribution + reviewer count ─────────
  // Resolve every "set by" id to a friendly name, plus the bundle
  // creator for the never-touched-decision fallback. Single round-trip.
  const attribution = await resolveDecisionAttribution(prisma, {
    bundleId: resolved.bundle.id,
    grantIds: item.decisions.map(
      (d) => decisionStates.get(d.id)?.setByGrantId ?? null,
    ),
  });
  // Active reviewers on the bundle — used for the "Shared with N
  // reviewers" line. Excludes revoked + superseded grants. Counts
  // people, not grant rows: same email can have multiple grants if
  // re-issued, so dedupe by lowercased email.
  const activeGrants = await prisma.presalesAccessGrant.findMany({
    where: {
      bundleId: resolved.bundle.id,
      revokedAt: null,
      supersededByGrantId: null,
    },
    select: { email: true },
  });
  const reviewerEmails = new Set(
    activeGrants.map((g) => g.email.toLowerCase()),
  );
  const reviewerCount = reviewerEmails.size;

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: resolved.bundle.id,
      grantId: resolved.grant.id,
      eventType: 'scope_viewed',
      payload: { scopeCode },
    },
  });

  const csrf = issueSessionNonce(resolved.session.id);
  const bundleSigned = !!resolved.bundle.signedAt;

  return (
    <main style={{ maxWidth: 960, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 13, color: '#5A5A5A', marginBottom: 4 }}>
          {resolved.bundle.clientCompanyName}
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, color: '#002B5C' }}>
          {item.title}
        </h1>
        <div
          style={{
            height: 2,
            background: '#002B5C',
            width: 64,
            marginTop: 12,
            marginBottom: 16,
          }}
        />
        <p style={{ margin: 0, color: '#5A5A5A' }}>{item.overview}</p>

        {/* Reviewer awareness — multi-stakeholder safety §2 */}
        <div
          style={{
            marginTop: 16,
            fontSize: 13,
            color: 'var(--ink-secondary, #4A4A4A)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'var(--surface-ink-tint, #F4F2EB)',
            border: '1px solid var(--border-default, #E5E1D6)',
            borderRadius: 9999,
          }}
          data-testid="reviewer-count"
        >
          {reviewerCount > 1 ? (
            <>
              <span aria-hidden>👥</span>
              <span>
                Shared with <strong>{reviewerCount} reviewers</strong> from{' '}
                {resolved.bundle.clientCompanyName}
              </span>
            </>
          ) : (
            <>
              <span aria-hidden>🔒</span>
              <span>Only you have access to this workbench</span>
            </>
          )}
        </div>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Decisions</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {item.decisions.map((d) => {
            const state = decisionStates.get(d.id);
            const currentChoice = state?.choice ?? 'open';
            // Resolve attribution: either the grant who set this row,
            // or the bundle-creator draft fallback when never touched.
            const setByGrantId = state?.setByGrantId ?? null;
            const resolvedAttribution = setByGrantId
              ? attribution.byGrantId.get(setByGrantId) ?? attribution.draftFallback
              : attribution.draftFallback;
            const setAtIso = (state?.setAt ?? resolved.bundle.startsAt).toISOString();
            return (
              <DecisionCardClient
                key={d.id}
                scopeCode={scopeCode}
                decisionId={d.id}
                sscui={d.sscui}
                title={d.title}
                summary={d.summary}
                stdDesc={d.std_desc}
                cfgDesc={d.cfg_desc}
                cstDesc={d.cst_desc}
                initial={{
                  rowId: state?.rowId ?? '',
                  choice: currentChoice,
                  setByName: resolvedAttribution.name,
                  setAtIso,
                  isDraftFallback: resolvedAttribution.isDraftFallback,
                }}
                bundleSigned={bundleSigned}
              />
            );
          })}
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Process steps</h2>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          {item.process_steps.map((step, i) => (
            <li key={`${step.name}-${i}`} style={{ marginBottom: 8, fontSize: 14 }}>
              <strong>{step.name}</strong> — {step.role} — {step.app}
              <div style={{ fontSize: 13, color: '#5A5A5A' }}>{step.expected}</div>
            </li>
          ))}
        </ol>
      </section>

      {!bundleSigned && resolved.grant.canSignOff ? (
        <section
          style={{
            marginTop: 32,
            padding: 20,
            background: '#FFFFFF',
            border: '1px solid #E5E5E5',
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 14, color: '#5A5A5A', margin: 0, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Sign the workbench
          </h2>
          <p style={{ fontSize: 13, color: '#5A5A5A', marginTop: 8, marginBottom: 16 }}>
            Signing locks all decisions and triggers a signed PDF copy to you and your ABeam consultant. Open items will be recorded as &ldquo;No position taken &mdash; for resolution in Explore phase&rdquo;.
          </p>
          <form method="POST" action="/c/sign" style={{ margin: 0 }}>
            <input type="hidden" name="csrf" value={csrf} />
            <button
              type="submit"
              style={{
                background: '#C8102E',
                color: '#FFFFFF',
                border: 'none',
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Sign and lock decisions
            </button>
          </form>
        </section>
      ) : null}

      <footer style={{ fontSize: 12, color: '#5A5A5A', marginTop: 32 }}>
        Release: {item.release} · Acknowledgement v{resolved.bundle.acknowledgementTextVersion}
      </footer>
    </main>
  );
}
