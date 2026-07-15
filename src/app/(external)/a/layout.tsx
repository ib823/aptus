/**
 * Affirm external executive surface layout (/a/*).
 *
 * Nests under the bare (external) passthrough layout and only adds the
 * surface's own responsive/motion stylesheet — scoped here so it never affects
 * the presales /c surface or the consultant affirm screens. globals.css (the
 * token system) is already loaded by the root layout.
 */

import type { ReactNode } from "react";
import "./affirm-external.css";

export default function AffirmExternalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
