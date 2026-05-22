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
import { EnhancedDecisionCard } from '@/components/presales/EnhancedDecisionCard';
import { NarrativeCard } from '@/components/presales/NarrativeCard';
import { Scorecard } from '@/components/presales/Scorecard';
import { topLevelArea } from '@/lib/fts/value-streams/o2c-sales';

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

  // ── Enhanced (BDC value-stream) branch ─────────────────────────────
  // When the catalog entry is a value stream (e.g. O2C-SALES), render
  // the first-wave enhanced workbench instead of the legacy scope-item
  // layout. Same data fetching above; different visual shell below.
  if (item.value_stream === true) {
    // Score the L2 decision-style answers (narrative cards don't count
    // toward "adopting standard %"). The decision/narrative split is
    // marked on each item via answer_kind.
    const decisionDefs = item.decisions.filter((d) => d.answer_kind !== 'narrative');
    const narrativeDefs = item.decisions.filter((d) => d.answer_kind === 'narrative');
    let standardCount = 0;
    let discussCount = 0;
    let deviateCount = 0;
    let narrativeAnswered = 0;
    for (const d of decisionDefs) {
      const state = decisionStates.get(d.id);
      if (!state) continue; // unanswered (defaults to std visually, but only persists on tap)
      if (state.choice === 'std') standardCount++;
      else if (state.choice === 'cfg') discussCount++;
      else if (state.choice === 'cst') deviateCount++;
    }
    for (const n of narrativeDefs) {
      const state = decisionStates.get(n.id);
      if (state && state.notes.trim().length > 0) narrativeAnswered++;
    }
    const answeredQuestions =
      standardCount + discussCount + deviateCount + narrativeAnswered;
    const totalQuestions = item.decisions.length;

    // Group questions by AREA (top-level — strips "— sub-topic" suffix
    // for the area band). Preserves the order the decisions appear in
    // the data file, which already matches the SAP source ordering.
    const groups = new Map<string, typeof item.decisions>();
    for (const d of item.decisions) {
      const area = topLevelArea(d.area_topic ?? 'Other');
      const existing = groups.get(area);
      if (existing) {
        existing.push(d);
      } else {
        groups.set(area, [d]);
      }
    }

    return (
      <main
        style={{
          maxWidth: 1080,
          margin: '30px auto',
          padding: '0 26px 70px',
          background: 'transparent',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: '#002B5C',
              color: '#FFFFFE',
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontWeight: 700,
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            A
          </div>
          <div
            style={{
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontWeight: 600,
              fontSize: 18,
              color: '#002B5C',
            }}
          >
            ABeam Workbench
          </div>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 30,
            color: '#002B5C',
            fontWeight: 700,
            margin: '16px 0 5px',
          }}
        >
          {item.title}
        </h1>
        <div
          style={{
            color: '#566070',
            fontSize: 14,
            maxWidth: 780,
            marginBottom: 20,
          }}
        >
          {item.source_note}
        </div>

        {/* Reviewer awareness pill (multi-stakeholder safety) */}
        <div
          style={{
            marginBottom: 14,
            fontSize: 13,
            color: '#566070',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#F4F2EB',
            border: '1px solid #E5E1D6',
            borderRadius: 9999,
          }}
          data-testid="reviewer-count"
        >
          {reviewerCount > 1
            ? `Shared with ${reviewerCount} reviewers from ${resolved.bundle.clientCompanyName}`
            : 'Only you have access to this workbench'}
        </div>

        <Scorecard
          scopeTitle={`${item.title} · pre-onboarding scoping`}
          scopeSubhead={`${resolved.bundle.clientCompanyName} · SAP S/4HANA Cloud Public Edition · ${totalQuestions} questions to affirm before the Fit-to-Standard workshop`}
          totalQuestions={totalQuestions}
          answeredQuestions={answeredQuestions}
          standardCount={standardCount}
          discussCount={discussCount}
          deviateCount={deviateCount}
        />

        <div
          style={{
            background: '#FFFFFE',
            border: '1px solid #E4E2DA',
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            padding: '18px 20px 22px',
          }}
        >
          {Array.from(groups.entries()).map(([area, defs]) => (
            <div key={area}>
              <div
                style={{
                  margin: '18px 0 10px',
                  padding: '7px 12px',
                  borderRadius: 7,
                  background: '#EAF0F6',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: '#002B5C',
                    textTransform: 'uppercase',
                  }}
                >
                  {area}
                </span>
              </div>
              {defs.map((d) => {
                const state = decisionStates.get(d.id);
                const setByGrantId = state?.setByGrantId ?? null;
                const resolvedAttribution = setByGrantId
                  ? attribution.byGrantId.get(setByGrantId) ?? attribution.draftFallback
                  : attribution.draftFallback;
                const setAtIso = (state?.setAt ?? resolved.bundle.startsAt).toISOString();
                const initial = {
                  rowId: state?.rowId ?? '',
                  notes: state?.notes ?? '',
                  setByName: resolvedAttribution.name,
                  setAtIso,
                  isDraftFallback: resolvedAttribution.isDraftFallback,
                };
                const question = d.client_rephrase ?? d.sap_verbatim ?? d.summary;
                if (d.answer_kind === 'narrative') {
                  return (
                    <NarrativeCard
                      key={d.id}
                      scopeCode={scopeCode}
                      decisionId={d.id}
                      title={d.title}
                      question={question}
                      initial={initial}
                      bundleSigned={bundleSigned}
                    />
                  );
                }
                return (
                  <EnhancedDecisionCard
                    key={d.id}
                    scopeCode={scopeCode}
                    decisionId={d.id}
                    title={d.title}
                    question={question}
                    sapVerbatim={d.sap_verbatim}
                    sscuiId={d.sscui_id || undefined}
                    sscuiName={d.sscui_name || undefined}
                    areaTopic={d.area_topic ?? ''}
                    scopeItemRefs={d.scope_item_refs}
                    initial={{
                      ...initial,
                      choice: (state?.choice ?? 'open') as 'open' | 'std' | 'cfg' | 'cst',
                    }}
                    bundleSigned={bundleSigned}
                  />
                );
              })}
            </div>
          ))}

          {!bundleSigned && resolved.grant.canSignOff ? (
            <div style={{ marginTop: 18, textAlign: 'center' }}>
              <form method="POST" action="/c/sign" style={{ display: 'inline-block' }}>
                <input type="hidden" name="csrf" value={csrf} />
                <button
                  type="submit"
                  style={{
                    background: '#C8102E',
                    color: '#FFFFFE',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '11px 26px',
                    cursor: 'pointer',
                  }}
                >
                  Submit for consultant review →
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 9,
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 9,
            fontSize: 12.5,
            lineHeight: 1.55,
            background: '#EAF0F6',
            borderLeft: '4px solid #002B5C',
            color: '#1A2230',
          }}
        >
          <div>
            <strong>What you&rsquo;re affirming.</strong> 28 plain-language questions — SAP&rsquo;s
            own Level-2 set — grouped by area. Every decision card opens pre-set to{' '}
            <strong>Adopt SAP standard</strong>: confirming is one tap, and effort
            is spent only on the exceptions. Choosing &ldquo;We do this differently&rdquo;
            requires a short business reason. The 145 Level-3 questions are
            worked in the Fit-to-Standard workshop after this is signed.
          </div>
        </div>

        <div
          style={{
            marginTop: 28,
            textAlign: 'center',
            fontSize: 11.5,
            color: '#8A93A0',
          }}
        >
          {item.release} · Acknowledgement v{resolved.bundle.acknowledgementTextVersion}
        </div>
      </main>
    );
  }

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
