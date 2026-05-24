/**
 * Affirm-set route-group layout — sole job is to import the responsive
 * stylesheet alongside the existing workbench chrome.
 *
 * The responsive pass targets only /affirm/* surfaces (process-flow
 * strip, choice rows, tiers, steppers, release bar). Loading the CSS
 * here keeps the rules out of the rest of the workbench's selector
 * tree.
 */

import type { ReactNode } from "react";
import "./affirm-responsive.css";

export default function AffirmLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
