/**
 * GET /c/ended — terminal confirmation page after logout.
 *
 * Pure static. Requires no cookie, no session, no DB. The /c/* headers in
 * next.config.ts still apply (Cache-Control: no-store, Referrer-Policy:
 * no-referrer) which is intentional — we don't want the rendered HTML
 * cached by intermediaries even though it carries no sensitive data.
 */

export default function PresalesEndedPage() {
  return (
    <main style={{ maxWidth: 480, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#5A5A5A', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Logged out
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: '#002B5C' }}>
        Session ended
      </h1>
      <p style={{ marginTop: 16, color: '#5A5A5A', fontSize: 15 }}>
        You have been signed out. You can close this tab.
      </p>
    </main>
  );
}
