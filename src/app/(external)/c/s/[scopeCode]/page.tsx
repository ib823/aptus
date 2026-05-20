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
} from '@/lib/presales/redaction';
import { readPresalesSession } from '@/lib/presales/session';
import { hashUserAgent } from '@/lib/presales/ua-fingerprint';

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

  await prisma.presalesAuditEvent.create({
    data: {
      bundleId: resolved.bundle.id,
      grantId: resolved.grant.id,
      eventType: 'scope_viewed',
      payload: { scopeCode },
    },
  });

  const CHOICE_LABELS: Record<string, string> = {
    open: 'Open',
    std: 'Standard',
    cfg: 'Configure',
    cst: 'Custom',
  };

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
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Decisions</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {item.decisions.map((d) => {
            const state = decisionStates.get(d.id);
            const currentChoice = state?.choice ?? 'open';
            return (
              <li
                key={d.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E5E5',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, color: '#5A5A5A' }}>{d.sscui}</div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0' }}>{d.title}</h3>
                <p style={{ margin: '8px 0', fontSize: 14, color: '#5A5A5A' }}>{d.summary}</p>
                <div
                  data-testid={`current-choice-${d.id}`}
                  style={{ fontSize: 13, marginTop: 8 }}
                >
                  Current choice: <strong>{CHOICE_LABELS[currentChoice] ?? currentChoice}</strong>
                </div>
                {bundleSigned ? (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#5A5A5A', fontStyle: 'italic' }}>
                    Read-only — bundle signed.
                  </div>
                ) : (
                  <form
                    method="POST"
                    action="/c/decisions"
                    style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}
                  >
                    <input type="hidden" name="scopeCode" value={scopeCode} />
                    <input type="hidden" name="decisionId" value={d.id} />
                    <input type="hidden" name="csrf" value={csrf} />
                    {(['std', 'cfg', 'cst'] as const).map((choiceKey) => (
                      <button
                        key={choiceKey}
                        type="submit"
                        name="choice"
                        value={choiceKey}
                        style={{
                          padding: '6px 12px',
                          fontSize: 13,
                          border: '1px solid #E5E5E5',
                          borderRadius: 6,
                          background: currentChoice === choiceKey ? '#002B5C' : '#FFFFFF',
                          color: currentChoice === choiceKey ? '#FFFFFF' : '#1A1A1A',
                          cursor: 'pointer',
                        }}
                      >
                        {CHOICE_LABELS[choiceKey]}
                      </button>
                    ))}
                  </form>
                )}
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13 }}>Show options</summary>
                  <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 13 }}>
                    <div>
                      <strong>Standard:</strong> {d.std_desc}
                    </div>
                    <div>
                      <strong>Configure:</strong> {d.cfg_desc}
                    </div>
                    <div>
                      <strong>Custom:</strong> {d.cst_desc}
                    </div>
                  </div>
                </details>
              </li>
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
