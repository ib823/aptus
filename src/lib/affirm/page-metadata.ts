/**
 * Browser-tab titles for the per-bundle affirm screens.
 *
 * Every /affirm/[id]/* route declared no `metadata`, so all of them inherited
 * the Workbench layout default and rendered as "ABeam Workbench". These are the
 * screens consultants keep open longest and return to most, and a wall of
 * identical tabs makes browser history and bookmarks useless precisely where
 * they would help — you cannot tell which client a tab belongs to.
 *
 * The client name comes first because that is what someone scans a tab strip
 * for. `{ absolute: ... }` opts out of the layout's "%s — ABeam Workbench"
 * template so the suffix appears once, not twice.
 */
import type { Metadata } from "next";

import { affirmBundleReadableBy } from "@/lib/affirm/authz";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function bundleMetadata(
  params: Promise<{ id: string }>,
  screen: string,
): Promise<Metadata> {
  const { id } = await params;
  // generateMetadata runs alongside the page, not behind its guard — the same
  // access rule the page enforces applies here, or the client's name leaks
  // through the <title> to anyone who enumerates bundle ids.
  const user = await getCurrentUser();
  if (!user) return { title: { absolute: `${screen} — ABeam Workbench` } };
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id },
    select: { client: true, createdById: true },
  });
  // A missing bundle renders notFound() anyway; title it honestly rather than
  // inventing a client name for a page that is about to 404. An unreadable one
  // gets the same title, so the two cases stay indistinguishable.
  if (!bundle || !affirmBundleReadableBy(bundle, user)) {
    return { title: { absolute: `${screen} — ABeam Workbench` } };
  }
  return { title: { absolute: `${bundle.client} · ${screen} — ABeam Workbench` } };
}
