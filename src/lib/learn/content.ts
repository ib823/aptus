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

const isSapPath = (pathname: string): boolean => pathname.includes("/sap-explorer");

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
