/**
 * SAP Operations route layout — mounts the shared learn framework
 * (AffirmLearnProvider) so /sap-explorer gets the same guided walk-through,
 * glossary drawer, and floating "Guide me" / "Decode jargon" helpers as
 * /affirm. Content is resolved by path from the learn registry.
 */
import type { ReactNode } from "react";
import { AffirmLearnProvider } from "@/components/affirm/learn/AffirmLearnProvider";

export default function SapExplorerLayout({ children }: { children: ReactNode }) {
  return <AffirmLearnProvider>{children}</AffirmLearnProvider>;
}
