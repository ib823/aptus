/**
 * ABeam Workbench shell — minimal chrome for the isolated presales surface.
 *
 * Intentionally NOT the AptusShell. The workbench is presented as its
 * own product:
 *   - ABeam Workbench wordmark (top-left, via the canonical <Wordmark>)
 *   - User menu (top-right) with email + sign out
 *   - No sidebar, no Aptus portal navigation
 *   - No links into /dashboard, /assessment, or any other Aptus portal route
 *
 * Single full-width content area on the warm-cream surface (brief §1.1).
 * Inner pages provide their own max-width container.
 */

import type { ReactNode } from 'react';
import { Wordmark } from '@/components/brand/Wordmark';
import { WorkbenchUserMenu } from './WorkbenchUserMenu';

interface Props {
  userEmail: string;
  children: ReactNode;
}

export function WorkbenchShell({ userEmail, children }: Props) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-cream)',
        color: 'var(--ink-primary)',
      }}
    >
      <header
        style={{
          background: 'var(--surface-paper)',
          borderBottom: '1px solid var(--border-default)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
        }}
      >
        <a
          href="/presales"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
          aria-label="ABeam Workbench — go to bundles"
        >
          <Wordmark size="md" />
        </a>
        <WorkbenchUserMenu email={userEmail} />
      </header>
      <main>{children}</main>
    </div>
  );
}
