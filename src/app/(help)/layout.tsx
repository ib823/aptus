import type { Metadata } from "next";

import { ManualChrome } from "@/components/help/ManualChrome";

export const metadata: Metadata = {
  title: { default: "Console manual", template: "%s · Console manual" },
};

/**
 * The manual's route group.
 *
 * NOT ROLE-GATED, on purpose. Documentation about a workspace you cannot open
 * is not a disclosure — it is the difference between a permission and a secret.
 * Hiding it would teach people the product is smaller than it is, and would
 * leave someone who has just been refused with nowhere to learn why.
 *
 * It contains no tenant data of any kind: every word is derived from route
 * definitions, RBAC predicates and hand-written prose committed to the repo.
 */
export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <ManualChrome>{children}</ManualChrome>;
}
