/**
 * Workbench route group — own chrome, own login redirect.
 *
 * This layout deliberately does NOT use AptusShell. It's the entry to a
 * standalone product surface for consultants doing presales work. The
 * Workbench shares the User table with the Aptus portal so consultants
 * have one account, but the URL space, login page, and chrome are
 * presented as a distinct product.
 *
 * Auth: unauthenticated users are sent to /presales/login (the
 * Workbench-branded sign-in), not to /login (the Aptus sign-in).
 *
 * No MFA / passkey / onboarding gates here. The Workbench is a
 * consultant tool used regularly; adding step-ups every visit is
 * friction with no equivalent threat model. The underlying NextAuth
 * session is the same as the Aptus portal's, so if MFA was completed
 * over there the cookie is already valid; if not, the Workbench
 * sign-in is sufficient for this surface.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/session';
import { WorkbenchShell } from '@/components/workbench/WorkbenchShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Override the root layout's "Aptus" defaults across the Workbench
 * surface:
 *   - title: child pages inherit "ABeam Workbench" or get
 *     "%s — ABeam Workbench" templated
 *   - metadataBase: OG cards and other absolute URL builders resolve
 *     against the canonical Workbench hostname (WORKBENCH_HOST) when
 *     set, so a /presales/{id} URL shared on Slack or LinkedIn renders
 *     a preview pointing at ab-workbench.vercel.app rather than
 *     aptus-sandy.vercel.app (which would 308-redirect through the
 *     middleware).
 * Child pages can override `title` again (e.g.
 * "Bundles — ABeam Workbench"); pages without their own title inherit
 * the default below.
 */
const _workbenchHost = process.env.WORKBENCH_HOST;
export const metadata: Metadata = {
  title: {
    default: 'ABeam Workbench',
    template: '%s — ABeam Workbench',
  },
  description: 'ABeam pre-onboarding Fit-to-Standard workbench',
  ...(_workbenchHost
    ? { metadataBase: new URL(`https://${_workbenchHost}`) }
    : {}),
};

export default async function WorkbenchLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/presales/login');
  return <WorkbenchShell userEmail={user.email ?? 'unknown'}>{children}</WorkbenchShell>;
}
