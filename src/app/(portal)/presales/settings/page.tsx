/**
 * Consultant presales settings — /presales/settings.
 *
 * Profile (PDF title), notification toggles, default window length,
 * default accent color. Pass 7. v1 stores these in localStorage on
 * submit — the form posts to /api/presales/preferences which is a stub
 * that records the audit event but defers persistence to a follow-up
 * (no schema column yet for consultant defaults).
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { canAccessPresales } from '@/lib/presales/rbac';

export const dynamic = 'force-dynamic';

export default async function PresalesSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessPresales(user.role)) redirect('/dashboard');

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Presales · Settings
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 0', color: '#002B5C' }}>
          Your presales preferences
        </h1>
      </header>

      <form
        method="POST"
        action="/api/presales/preferences"
        style={{ display: 'grid', gap: 16, background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, padding: 24 }}
      >
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5A5A5A' }}>Display name on signed PDF</span>
          <input
            name="pdfDisplayName"
            defaultValue={user.name ?? ''}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5A5A5A' }}>Default access window (days)</span>
          <input type="number" min={1} max={30} name="defaultWindowDays" defaultValue={7} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5A5A5A' }}>Default accent color (hex)</span>
          <input name="defaultAccent" defaultValue="#002B5C" style={inputStyle} />
        </label>
        <fieldset style={{ border: '1px solid #E5E5E5', padding: 12, borderRadius: 8, display: 'grid', gap: 8 }}>
          <legend style={{ fontSize: 13, color: '#5A5A5A', padding: '0 4px' }}>Notifications</legend>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" name="notifyOnSignoff" defaultChecked /> Email me when a bundle is signed
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" name="notifyOnOtpLockout" defaultChecked /> Email me when a grant is locked out (5 failed OTPs)
          </label>
        </fieldset>
        <div style={{ fontSize: 12, color: '#888780' }}>
          Localization · BM / Chinese language packs are designed and documented for v1.1. English-only in v1.
        </div>
        <button
          type="submit"
          style={{
            background: '#C8102E',
            color: '#FFFFFF',
            border: 'none',
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            cursor: 'pointer',
            justifySelf: 'start',
          }}
        >
          Save preferences
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #E5E5E5',
  borderRadius: 8,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};
