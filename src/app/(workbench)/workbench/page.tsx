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

import Link from 'next/link';
import { SampleSandboxCard } from '@/components/affirm/learn/SampleSandboxCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export default function WorkbenchHomePage() {
  const sampleEnabled =
    process.env.INTERNAL_TEST_DEPLOYMENT === "true" ||
    process.env.WORKBENCH_ONLY === "true";

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link
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
          </Link>
        ))}
      </div>
    </div>
  );
}
