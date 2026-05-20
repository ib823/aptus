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

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/session';
import { WorkbenchShell } from '@/components/workbench/WorkbenchShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorkbenchLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/presales/login');
  return <WorkbenchShell userEmail={user.email ?? 'unknown'}>{children}</WorkbenchShell>;
}
