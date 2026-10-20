/**
 * A free Organization slug for a name.
 *
 * MOVED HERE FROM /api/auth/signup, which had it inline, because three places
 * now create organizations: that route, the developer workspace a first
 * sign-in creates, and POST /api/admin/organizations. On a collision it
 * suffixes rather than refuses, so the answer never reveals that a name is
 * taken.
 *
 * Not a reservation: two creates racing for the same free slug can still
 * collide on the unique index, and the second fails loudly rather than
 * sharing a slug.
 */

import { generateSlug } from "@/lib/commercial/plan-engine";
import { prisma } from "@/lib/db/prisma";

export async function uniqueOrganizationSlug(name: string): Promise<string> {
  const baseSlug = generateSlug(name) || "organization";
  let slug = baseSlug;
  for (let attempt = 2; attempt <= 50; attempt++) {
    const taken = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) return slug;
    slug = `${baseSlug}-${attempt}`;
  }
  // Fifty of the same name: stop counting and make it unguessable instead.
  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}
