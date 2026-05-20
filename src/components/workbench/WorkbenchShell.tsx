/**
 * Workbench shell — minimal chrome for the isolated workbench surface.
 *
 * Intentionally NOT the AptusShell. The workbench is presented as its
 * own product:
 *   - "Workbench" wordmark (top-left)
 *   - User menu (top-right) with email + sign out
 *   - No sidebar, no Aptus navigation
 *   - No links into /dashboard, /assessment, or any other Aptus portal route
 *
 * Single full-width content area. Inner pages provide their own
 * max-width container.
 */

import type { ReactNode } from 'react';
import { WorkbenchUserMenu } from './WorkbenchUserMenu';

interface Props {
  userEmail: string;
  children: ReactNode;
}

export function WorkbenchShell({ userEmail, children }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#1A1A1A' }}>
      <header
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E5E5',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <a
          href="/presales"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textDecoration: 'none',
            color: '#002B5C',
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: '-0.01em',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 24,
              height: 24,
              background: '#002B5C',
              borderRadius: 6,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 6,
                background: '#C8102E',
                borderRadius: 2,
              }}
            />
          </span>
          Workbench
        </a>
        <WorkbenchUserMenu email={userEmail} />
      </header>
      <main>{children}</main>
    </div>
  );
}
