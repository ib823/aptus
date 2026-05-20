/**
 * External route group — used for the presales /c/* surface.
 *
 * Intentionally bare. Doesn't import the portal chrome, the consultant nav,
 * or any tenant-aware widgets. Anything the guest user sees comes from
 * inside this group.
 *
 * The root app/layout.tsx provides html + body; this is just a passthrough
 * wrapper that keeps the (external) group separate from (portal) and
 * (public) for clarity.
 */

import type { ReactNode } from 'react';

export default function ExternalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
