/**
 * Public-facing origin for the Workbench surface.
 *
 * Used to build absolute URLs that the recipient sees:
 *   - Guest invitation magic-links (https://<origin>/c/{token})
 *   - Reissued magic-links
 *   - OG card / metadataBase for Workbench pages
 *
 * Precedence (highest first):
 *   1. WORKBENCH_HOST env — set when the Workbench is on its own
 *      hostname (e.g. ab-workbench.vercel.app). Always wins because
 *      the deployment owner has explicitly declared this is the
 *      canonical Workbench URL.
 *   2. NEXT_PUBLIC_APP_URL env — the deployment-wide canonical URL.
 *      Used when the Workbench shares a hostname with the Aptus
 *      portal (e.g. aptus-sandy.vercel.app/presales).
 *   3. Request origin — falls back to whichever hostname the request
 *      came in on. Useful for preview deployments where neither env
 *      var is set.
 *
 * Returns a fully-qualified origin (https://host), never with a
 * trailing slash, never with a path.
 */
export function workbenchPublicOrigin(request: { url: string }): string {
  const workbenchHost = process.env.WORKBENCH_HOST;
  if (workbenchHost) return `https://${workbenchHost}`;
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envAppUrl) return new URL(envAppUrl).origin;
  return new URL(request.url).origin;
}
