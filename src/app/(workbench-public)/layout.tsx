/**
 * Public-side of the Workbench (login, ended, anything else reachable
 * without a session). Renders without any chrome — the inner pages
 * provide their own full-screen layouts.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Workbench', template: '%s — Workbench' },
  description: 'Presales decisions workbench',
};

export default function WorkbenchPublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
