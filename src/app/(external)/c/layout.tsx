/**
 * Presales /c/* surface layout.
 *
 * Bare, like the parent (external) passthrough — its one job is the SAP
 * content release footer (2608 WS0): every page that grounds a guest's view
 * on SAP Best Practices names the release it grounds on.
 */

import type { ReactNode } from "react";
import { SapContentReleaseFooter } from "@/components/sap-content/SapContentReleaseFooter";

export default function PresalesExternalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SapContentReleaseFooter />
    </>
  );
}
