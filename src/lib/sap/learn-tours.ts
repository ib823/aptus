/**
 * SAP Operations coach-mark tour — a narrated walk-through of /sap-explorer for
 * a reader with no SAP background. Same shape as the affirm tours; driven by the
 * shared learn provider (driver.js). Steps target [data-tour="..."] anchors and
 * are skipped gracefully if their anchor isn't on the page yet.
 */
import type { AffirmTour } from "@/lib/affirm/learn-tours";

export const SAP_TOURS: Record<string, AffirmTour> = {
  "sap-explorer": {
    id: "sap-explorer",
    title: "SAP Operations walk-through",
    steps: [
      {
        element: '[data-tour="sap-scorecard"]',
        title: "Start with readiness",
        description:
          "This summary answers ‘what can we actually use today?’. The big number is how many services a live check confirmed are switched on — not a guess.",
        side: "bottom",
      },
      {
        element: '[data-tour="sap-tiles"]',
        title: "Everything SAP offers, by type",
        description:
          "SAP publishes many kinds of content. Each tile is one type with its count. Tap any tile to read, in plain language, what that type is.",
        side: "bottom",
      },
      {
        element: '[data-tour="sap-filters"]',
        title: "Filter by status",
        description:
          "Every item carries an honest badge — Activated, Needs setup, Not checked, and so on. Tap a badge anywhere to see exactly what it means; use these filters to focus.",
        side: "bottom",
      },
      {
        element: '[data-tour="sap-row"]',
        title: "Open any item",
        description:
          "Click a row to expand it. You'll see whether it's read-only or can write, plus how to switch it on if it isn't already.",
        side: "top",
      },
      {
        element: '[data-tour="sap-ladder"]',
        title: "What it can do",
        description:
          "Inside an open item, the capability ladder and the read/create/update/delete table show exactly what the service allows — read straight from the service itself.",
        side: "top",
      },
      {
        element: '[data-tour="sap-procurement"]',
        title: "A live heartbeat",
        description:
          "This section actually reads a few key services live and shows sample rows — proof that data really flows, not just that a door opened.",
        side: "top",
      },
      {
        element: '[data-tour="sap-entity-explorer"]',
        title: "Look inside anything",
        description:
          "Pick or paste any switched-on service here to list its data and preview real rows — all read-only. Nothing you do on this page changes SAP.",
        side: "top",
      },
    ],
  },
};

/** Resolve the SAP tour for a pathname (mirrors affirm's tourForPath). */
export function sapTourForPath(pathname: string): AffirmTour | null {
  if (pathname === "/sap-explorer" || pathname.endsWith("/sap-explorer")) {
    return SAP_TOURS["sap-explorer"] ?? null;
  }
  return null;
}
