"use client";

/**
 * The Workbench's contextual help control — the Console's "?" on this side.
 *
 * A manual you have to go and find is a manual nobody reads. The Console solved
 * that with a "?" in its top bar that lands on the page for the screen you are
 * looking at; the Workbench had no equivalent, because until now it had no pages
 * to point at. Its only route into help was "Help & docs" in a menu, which
 * opened a manual about a different part of the product entirely.
 *
 * It renders only when there IS a page. `manualSlugForPath` returns null off the
 * documented product, so this cannot become a link to a guess — which matters
 * more here than on the Console, because the Workbench contains routes that are
 * deliberately undocumented (a session's facilitate mode, a library drawer) and
 * a "?" on one of those would promise something that does not exist.
 *
 * A client component for one reason: the pathname. Everything it reads comes
 * from plain lib modules, so nothing about this pulls the manual's data into the
 * browser bundle beyond the slug lookup it needs.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { manualSlugForPath } from "@/lib/help/manual";

export function WorkbenchHelpLink() {
  const pathname = usePathname();
  const slug = manualSlugForPath(pathname);
  if (!slug) return null;

  return (
    <Link
      href={`/help/${slug}`}
      aria-label="Open the manual page for this screen"
      title="What this screen will not tell you"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        color: "var(--ink-secondary)",
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
        flexShrink: 0,
      }}
    >
      ?
    </Link>
  );
}
