'use client';

/**
 * Top-right user menu in the Workbench chrome. Email + dropdown with
 * "Sign out". No links to the broader Aptus portal — the Workbench is
 * presented as its own product.
 */

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
          {/*
            A plain link to the GET logout route, NOT next-auth's signOut().
            This is the same choice StudioTopBar documents, and it was missed
            here — which meant Sign out on the Workbench did not sign anyone out.

            next-auth's signOut() clears the NextAuth cookies and nothing else.
            It never touches the custom session cookie and never revokes the
            session row. The middleware authenticates on
            `request.cookies.has(SESSION_COOKIE)`, so the surviving cookie kept
            the user signed in — with a live server-side session — while the UI
            said they had left. Found by a browser agent auditing this build,
            which could not clear its own session to test the signed-out
            perimeter.

            /api/auth/logout revokes the session row AND expires every cookie
            variant, including the secure-prefixed and chunked NextAuth names.

            A FORM POST, not a link: logout mutates state, and a GET that
            mutates is CSRF-able (any page could sign the user out with an
            <img src>). The route is POST-only for the mutation now.
          */}
          <form method="post" action="/api/auth/logout" style={{ margin: 0 }}>
          <button
            type="submit"
            role="menuitem"
            style={{
              display: 'block',
              textDecoration: 'none',
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
          </form>
        </div>
      ) : null}
    </div>
  );
}
