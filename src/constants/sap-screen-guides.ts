/**
 * SAP Operations screen guides — plain-language "what is this?" panels for the
 * /sap-explorer page and each of its major sections, for readers with no SAP
 * background. Same `ScreenGuide` shape as affirm, rendered by the shared
 * <ScreenGuide> component (page-level by path, sections by explicit id).
 */
import type { ScreenGuide } from "@/constants/affirm-screen-guides";

export const SAP_SCREEN_GUIDES: Record<string, ScreenGuide> = {
  "sap-operations": {
    id: "sap-operations",
    eyebrow: "SAP Operations",
    title: "What is this page?",
    what: "A live window into your SAP system: what data services exist, which are switched on, and what you can safely read right now.",
    todo: "Skim the readiness summary, browse the catalogue tiles, and open any row to see details. Tap any underlined term or coloured badge to get a plain-language explanation.",
    why: "It turns a huge, jargon-heavy SAP catalogue into an honest, at-a-glance picture — nothing here claims to work unless a live check proved it.",
    next: "Use ‘Guide me’ any time for a walk-through, or ‘Decode jargon’ to look up any term. Nothing on this page changes your SAP data.",
    keyTerms: ["probe", "activation", "authorized-vs-data-confirmed", "runtime-vs-reference"],
    audience: "consultant",
  },
  "sap-catalogue": {
    id: "sap-catalogue",
    eyebrow: "Capability Catalogue",
    title: "The catalogue of everything SAP offers",
    what: "Every type of content SAP publishes for your edition, each with an honest status badge showing whether it's switched on for you.",
    todo: "Filter by type or status, then open a row to see what it can do (read/write) and how to switch it on if needed.",
    why: "It's the single, honest source of ‘what can we actually connect to’ — badges only say ‘Activated’ when a real check succeeded.",
    next: "Found something you want to use? Open it, check its read/write, and note the communication arrangement it needs.",
    keyTerms: ["status-activated", "status-needs-setup", "status-not-checked", "type-api", "crud"],
    audience: "consultant",
  },
  "sap-procurement": {
    id: "sap-procurement",
    eyebrow: "Procurement Operations",
    title: "A live sample from a few key services",
    what: "A quick, live read of a handful of important procurement services — proof that data really flows, shown as sample rows.",
    todo: "Glance at the status pills and row counts to confirm the connection is healthy. This is a sample, not the full list.",
    why: "It's a fast heartbeat check. For the complete picture use the Capability Catalogue above, or inspect any service in the Entity Explorer below.",
    next: "To read a different service, scroll to the Entity Explorer and enter its id.",
    keyTerms: ["probe", "entity-set", "authorized-vs-data-confirmed"],
    audience: "consultant",
  },
  "sap-entity-explorer": {
    id: "sap-entity-explorer",
    eyebrow: "Entity Explorer",
    title: "Look inside any switched-on service",
    what: "A hands-on tool to pick a service, see its data collections (entity sets), and preview a few real rows — all read-only.",
    todo: "Choose a service (or paste its id), press ‘Inspect’ to list its entity sets, then ‘Preview 10’ to see sample rows.",
    why: "It lets you verify with your own eyes that a service returns real data, before anyone builds on it.",
    next: "Nothing you do here changes SAP — it only reads. Writing data is a separate, guarded step (see Write Mode).",
    keyTerms: ["entity-set", "probe", "crud", "metadata"],
    audience: "consultant",
  },
  "sap-write-mode": {
    id: "sap-write-mode",
    eyebrow: "Write Mode",
    title: "Carefully create a record (guarded)",
    what: "The one place that can change SAP data — create a record in a chosen service. It's off unless explicitly enabled and confirmed.",
    todo: "Only use this if you intend to write. It requires the service to be enabled, a typed confirmation, and a secret — by design.",
    why: "Reading is safe; writing isn't. The guards make an accidental change effectively impossible.",
    next: "If you only need to look at data, stay in the Entity Explorer — it never writes anything.",
    keyTerms: ["crud", "activation", "communication-arrangement"],
    audience: "consultant",
  },
};

/** Page-level guide by pathname (mirrors affirm's screenGuideForPath). */
export function sapScreenGuideForPath(pathname: string): ScreenGuide | null {
  if (pathname === "/sap-explorer" || pathname.endsWith("/sap-explorer")) {
    return SAP_SCREEN_GUIDES["sap-operations"] ?? null;
  }
  return null;
}
