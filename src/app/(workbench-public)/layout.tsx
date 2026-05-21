/**
 * Public-side of the Workbench (login, ended, anything else reachable
 * without a session). Renders without any chrome — the inner pages
 * provide their own full-screen layouts.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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

export default function WorkbenchPublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
