/**
 * Public-side of the Workbench (login, ended, anything else reachable
 * without a session). Renders without any chrome — the inner pages
 * provide their own full-screen layouts.
 */

import type { ReactNode } from 'react';

export default function WorkbenchPublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
