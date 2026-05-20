'use client';

/**
 * Top-right user menu in the Workbench chrome. Email + dropdown with
 * "Sign out". No links to the broader Aptus portal — the Workbench is
 * presented as its own product.
 */

import { signOut } from 'next-auth/react';
import { useState } from 'react';

interface Props {
  email: string;
}

export function WorkbenchUserMenu({ email }: Props) {
  const [open, setOpen] = useState(false);

  const initials = (email.split('@')[0] ?? 'U').slice(0, 2).toUpperCase();

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#F1EFE8',
          border: '1px solid #E5E5E5',
          borderRadius: 999,
          padding: '4px 12px 4px 4px',
          cursor: 'pointer',
          fontSize: 13,
          color: '#1A1A1A',
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            background: '#002B5C',
            color: '#FFFFFF',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {initials}
        </span>
        <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 200,
            background: '#FFFFFF',
            border: '1px solid #E5E5E5',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            padding: 4,
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/presales/login' })}
            role="menuitem"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              fontSize: 13,
              color: '#1A1A1A',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F4F0')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
