import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ManualChrome } from "@/components/help/ManualChrome";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "Console manual", template: "%s · Console manual" },
};

/**
 * The manual's route group.
 *
 * SIGNED IN, BUT NOT ROLE-GATED. The two are different gates and this group
 * needs exactly one of them.
 *
 * Not role-gated, on purpose: documentation about a workspace you cannot open
 * is not a disclosure, it is the difference between a permission and a secret.
 * Hiding it would teach people the product is smaller than it is, and would
 * leave someone who has just been refused with nowhere to learn why.
 *
 * SESSION-GATED, because "no tenant data" is not the same as "safe to publish".
 * This group shipped with no gate at all and was anonymous-readable on the
 * internet — all twenty pages, 200 with no cookie. The claim in this comment's
 * previous version was true and beside the point: the pages carry no customer
 * data, and they carry the authorization roster verbatim, every incident rule
 * with the threshold that fires it, and a named unfixed defect about unbounded
 * grants. The manual's most valuable section is a catalogue of where the product
 * is weakest, which is worth a great deal to a colleague and rather more to
 * someone probing it.
 *
 * A session is the whole gate. Every signed-in role still reads all twenty
 * pages, which is the entire point of not role-gating it.
 *
 * This makes the group dynamic, which costs nothing: the pages render from
 * constants with no I/O beyond the session lookup this gate performs anyway.
 * The `force-static` directives they carried are gone rather than left as dead
 * configuration claiming a build-time guarantee that no longer holds.
 */
export default async function ManualLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/presales/login");

  return <ManualChrome>{children}</ManualChrome>;
}
