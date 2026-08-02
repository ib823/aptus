/**
 * Learn-content registry — the single merge point that lets the shared learn
 * framework (provider, ScreenGuide, GlossaryDrawer, Term) serve more than one
 * domain. It dispatches by pathname: affirm content for /affirm*, SAP content
 * for /sap-explorer*. Adding a new domain = add its content files + a branch here;
 * the components don't change.
 */
import {
  AFFIRM_GLOSSARY,
  GLOSSARY_ORDER,
  type GlossaryEntry,
} from "@/constants/affirm-glossary";
import {
  AFFIRM_SCREEN_GUIDES,
  screenGuideForPath as affirmScreenGuideForPath,
  type ScreenGuide,
} from "@/constants/affirm-screen-guides";
import { tourForPath as affirmTourForPath, type AffirmTour } from "@/lib/affirm/learn-tours";
import { SAP_GLOSSARY, SAP_GLOSSARY_ORDER } from "@/constants/sap-glossary";
import { SAP_SCREEN_GUIDES, sapScreenGuideForPath } from "@/constants/sap-screen-guides";
import { sapTourForPath } from "@/lib/sap/learn-tours";

/**
 * Where the SAP catalogue is on screen — which is not only /sap-explorer.
 *
 * This matched `/sap-explorer` alone, but Studio's Discover screen renders the
 * SAME catalogue components (SapCapabilityCatalogue, ContentTypeTiles,
 * CapabilityDetail) — that is the stated reason the Studio layout mounts the
 * learn provider at all. So the provider was mounted, the drawer opened, and it
 * served the AFFIRM glossary: a builder looking at OData entity sets was offered
 * definitions of "Fit-to-Standard", "affirm bundle" and "value stream", while
 * `odata-v4`, `metadata` and `communication-arrangement` sat in the other
 * glossary unreachable from the one screen that needed them.
 *
 * Keyed on the surfaces that render the catalogue, so adding a third one is a
 * line here rather than a silent fallback to the wrong domain.
 */
const SAP_CATALOGUE_PATHS = ["/sap-explorer", "/studio/discover"] as const;

const isSapPath = (pathname: string): boolean =>
  SAP_CATALOGUE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.includes(p));

/** Merged lookup by id across all domains (used by <Term> + related chips). */
const ALL_GLOSSARY: Record<string, GlossaryEntry> = { ...AFFIRM_GLOSSARY, ...SAP_GLOSSARY };

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return ALL_GLOSSARY[id];
}

/** The glossary list + order for the drawer on a given path. */
export function glossaryFor(pathname: string): { entries: Record<string, GlossaryEntry>; order: string[] } {
  if (isSapPath(pathname)) return { entries: SAP_GLOSSARY, order: SAP_GLOSSARY_ORDER };
  return { entries: AFFIRM_GLOSSARY, order: GLOSSARY_ORDER };
}

/** Page-level screen guide for a path (SAP first, then affirm). */
export function resolveScreenGuide(pathname: string): ScreenGuide | null {
  return sapScreenGuideForPath(pathname) ?? affirmScreenGuideForPath(pathname);
}

/** A specific screen guide by id (used to render section panels explicitly). */
export function screenGuideById(id: string): ScreenGuide | null {
  return SAP_SCREEN_GUIDES[id] ?? AFFIRM_SCREEN_GUIDES[id] ?? null;
}

/** The coach-mark tour for a path (SAP first, then affirm). */
export function resolveTour(pathname: string): AffirmTour | null {
  return sapTourForPath(pathname) ?? affirmTourForPath(pathname);
}
