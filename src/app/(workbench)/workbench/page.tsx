/**
 * ABeam Workbench home — /workbench.
 *
 * The landing surface for the pre-onboarding Fit-to-Standard Workbench.
 * On a Workbench-only deployment (WORKBENCH_ONLY=true) the middleware
 * lands the root and every non-Workbench route here, so this is the first
 * thing an authenticated consultant sees.
 *
 * It is deliberately a hub, not a dashboard: two entry cards into the two
 * Workbench surfaces —
 *   - /affirm   value-stream Fit-to-Standard affirm-sets (client questionnaire)
 *   - /presales scope-item bundles + guest sign-off
 *
 * Auth + chrome come from the (workbench) layout (redirects to
 * /presales/login when unauthenticated).
 */

import { SampleSandboxCard } from '@/components/affirm/learn/SampleSandboxCard';
import { SapOperationsDashboard } from '@/components/sap/SapOperationsDashboard';
import { getConfiguredSapTenants } from '@/lib/sap-public/tdd-connector';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** True when at least one SAP TDD tenant is configured (S4_TDD_* env). */
function sapTddConfigured(): boolean {
  try {
    return getConfiguredSapTenants().length > 0;
  } catch {
    return false;
  }
}

export const metadata = {
  title: { absolute: 'ABeam Workbench' },
};

interface SurfaceCard {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

const SURFACES: readonly SurfaceCard[] = [
  {
    href: '/affirm',
    eyebrow: 'Fit-to-Standard',
    title: 'Affirm bundles',
    body:
      'Assemble a value-stream affirm-set, send it to the client to affirm the ' +
      'client-facing Fit-to-Standard questions in advance, then release. The ' +
      'affirmations determine what is standard vs. non-standard and shape the ' +
      'workshop scope.',
    cta: 'Open affirm',
  },
  {
    href: '/presales',
    eyebrow: 'Presales',
    title: 'Scope-item bundles',
    body:
      'Create SAP scope-item bundles and collect client sign-off through a ' +
      'time-boxed guest link. Track each bundle from draft to sent to signed, ' +
      'with a full decision audit trail.',
    cta: 'Open presales',
  },
];

/** Feature-gated third surface. Only rendered when NEUTRAL_DISCOVERY_ENABLED
 * is "true" (the same flag the /discovery routes and middleware allow-list
 * check), so the hub never advertises a surface the deployment can't reach. */
const DISCOVERY_SURFACE: SurfaceCard = {
  href: '/discovery',
  eyebrow: 'Process Discovery',
  title: 'APQC process library',
  body:
    'Explore the neutral APQC-based process library, track coverage gaps ' +
    'against the client, and run discovery sessions before the SAP scope and ' +
    'workshop agenda are fixed.',
  cta: 'Open discovery',
};

export default function WorkbenchHomePage() {
  const sampleEnabled =
    process.env.INTERNAL_TEST_DEPLOYMENT === "true" ||
    process.env.WORKBENCH_ONLY === "true";
  const showSap = sapTddConfigured();
  const surfaces =
    process.env.NEUTRAL_DISCOVERY_ENABLED === "true"
      ? [...SURFACES, DISCOVERY_SURFACE]
      : SURFACES;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Pre-onboarding · Fit-to-Standard
        </p>
        <h1 className="font-serif text-3xl leading-10 text-ink">ABeam Workbench</h1>
        <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
          Prepare a client engagement before onboarding: capture Fit-to-Standard
          decisions in advance so the SAP scope, gaps, and workshop sessions are
          settled before the first session.
        </p>
      </header>

      {sampleEnabled && <SampleSandboxCard />}

      {/* Plain <a>, not next/link: on this deployment the client-side soft
          navigation between workbench surfaces intermittently fails to commit
          (the click registers but the route never changes). A full-document
          navigation always lands. Same fix as the /sap-explorer link. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {surfaces.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-card-warm border border-border-default bg-paper p-6 shadow-card transition hover:border-cta/40 hover:shadow-md"
          >
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              {s.eyebrow}
            </p>
            <h2 className="font-serif text-xl text-ink">{s.title}</h2>
            <p className="mt-2 flex-1 text-sm text-ink-soft">{s.body}</p>
            <span className="mt-5 inline-flex items-center text-sm font-semibold text-navy transition group-hover:text-navy-hover">
              {s.cta} &rarr;
            </span>
          </a>
        ))}
      </div>

      {showSap && (
        <section className="mt-12 border-t border-border-default pt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                Live · SAP S/4HANA Cloud Public
                <span className="inline-flex items-center gap-1 rounded-pill bg-decision-standard/10 px-2 py-0.5 text-[10px] font-semibold text-decision-standard">
                  <span className="inline-block size-1.5 rounded-full bg-decision-standard" />
                  connected
                </span>
              </p>
              <h2 className="font-serif text-2xl text-ink">SAP Operations</h2>
              <p className="mt-1 max-w-[720px] text-sm text-ink-soft">
                Live procurement data pulled straight from your SAP TDD tenant — per-service
                reachability, latency, and sample records.
              </p>
            </div>
            {/* Plain <a>, not next/link: /sap-explorer lives in the (public)
                route group while this page is in (workbench). The cross-group
                soft navigation intermittently fails to commit (URL stays on
                /workbench), so force a full-document navigation. */}
            <a
              href="/sap-explorer"
              className="inline-flex h-10 items-center rounded-input border border-border-default bg-paper px-4 text-sm font-semibold text-navy transition hover:border-navy"
            >
              Open full explorer &rarr;
            </a>
          </div>
          <SapOperationsDashboard />
        </section>
      )}
    </div>
  );
}
