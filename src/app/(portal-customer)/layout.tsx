/**
 * Phase 12 — customer-facing portal layout.
 *
 * Minimal chrome: just the Aptus mark + the page content. No nav,
 * no auth widget, no internal-tool surfaces.
 */

import "../globals.css";

export const metadata = {
  title: "Aptus · Read-Only Assessment View",
};

export default function CustomerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">
        <header className="border-b border-border">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="font-bold tracking-tight">Aptus</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Read-only customer view
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-12 border-t border-border">
          <div className="max-w-4xl mx-auto px-6 py-4 text-xs text-muted-foreground">
            Powered by Aptus — SAP fit-to-standard assessment platform.
          </div>
        </footer>
      </body>
    </html>
  );
}
