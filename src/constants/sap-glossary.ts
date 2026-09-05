/**
 * SAP Operations glossary — plain-language definitions for the /sap-explorer
 * screen, written for readers with ZERO SAP or integration background.
 *
 * Same shape as the affirm glossary (term / short / why / related) so the shared
 * <GlossaryDrawer>, <Term> chip, and <ScreenGuide> render it unchanged. Ids are
 * stable kebab-case; status-* and type-* ids are what the badges and tiles use
 * for one-tap "what does this mean?".
 */
import type { GlossaryEntry } from "@/constants/affirm-glossary";

export const SAP_GLOSSARY: Record<string, GlossaryEntry> = {
  // ── core concepts ────────────────────────────────────────────────────────
  odata: {
    term: "OData",
    short:
      "A standard way to read and write business data over the web — like a menu of data that apps can order from using ordinary web requests.",
    why: "Most of the live data you can pull from SAP here travels over OData. If a service speaks OData, we can inspect it and read a sample without any custom code.",
    related: ["odata-v2", "odata-v4", "metadata", "entity-set"],
  },
  "odata-v2": {
    term: "OData V2",
    short: "The older, very widely used version of OData. Reliable and predictable.",
    why: "Most SAP services here are V2. We can read exactly what they can do (read/create/update/delete) straight from their description.",
    related: ["odata", "odata-v4"],
  },
  "odata-v4": {
    term: "OData V4",
    short: "The newer version of OData. Similar idea, slightly different shape.",
    why: "We probe V4 too, but read its capabilities on a best-effort basis — where V4 doesn't spell something out, we don't guess it.",
    related: ["odata", "odata-v2"],
  },
  soap: {
    term: "SOAP",
    short:
      "An older, message-style way of talking to SAP — you send a structured envelope in and get one back. Often one-directional (inbound or outbound).",
    why: "SOAP services aren't browsable like OData, so we can't read a live row from them here. We label them by their protocol instead of claiming a 'read'.",
    related: ["odata"],
  },
  metadata: {
    term: "$metadata",
    short:
      "A service's self-description — the list of what data it holds and which actions it allows. Reading it moves no business data.",
    why: "Reaching a service's $metadata is our safe, read-only way to confirm it's switched on and to see what it can do, without touching real records.",
    related: ["probe", "entity-set", "authorized-vs-data-confirmed"],
  },
  "communication-arrangement": {
    term: "Communication arrangement (SAP_COM_xxxx)",
    short:
      "The switch inside SAP that turns a service on for your system and says who's allowed to use it. Each one has a code like SAP_COM_0053.",
    why: "A service can be published by SAP but still switched off in your tenant. Turning on its communication arrangement is what moves it from 'needs setup' to 'activated'.",
    related: ["activation", "status-needs-setup", "status-activated"],
  },
  activation: {
    term: "Activation",
    short: "Switching a service on in your own SAP system so it can actually be used.",
    why: "The catalogue only marks something 'Activated' when a live check confirms it — never just because SAP offers it.",
    related: ["communication-arrangement", "status-activated", "probe"],
  },
  probe: {
    term: "Probe",
    short:
      "A quick, read-only check we run against a service to see if it responds — like knocking on a door to see if anyone's home. It changes nothing.",
    why: "Every honest status on this page comes from a real probe result. If we didn't probe something, we say 'not checked' instead of guessing.",
    related: ["metadata", "status-not-checked", "authorized-vs-data-confirmed"],
  },
  "entity-set": {
    term: "Entity set",
    short:
      "One table-like collection inside a service — e.g. 'Purchase Orders' or 'Suppliers'. A service usually has several.",
    why: "When you inspect or preview a service, you're looking at its entity sets: the actual lists of records you could read.",
    related: ["odata", "crud"],
  },
  crud: {
    term: "CRUD (read / create / update / delete)",
    short:
      "The four things you might do with data: Create, Read, Update, Delete. A service may allow some and not others.",
    why: "The read/write chips tell you at a glance whether a service is read-only or can also change data — straight from what the service itself declares.",
    related: ["entity-set", "runtime-vs-reference"],
  },
  "cds-view": {
    term: "CDS view",
    short:
      "A ready-made 'saved view' of SAP data (think of a prepared report or query) that apps can read, often over OData.",
    why: "CDS views are a rich source of read-only data. Here they're probeable like APIs, so many can be checked for live access.",
    related: ["odata", "type-cds-view"],
  },
  badi: {
    term: "BAdI",
    short:
      "A built-in extension point where SAP lets you add your own custom logic — a labelled hook, not a data endpoint.",
    why: "BAdIs are design-time reference material, not something you read live. They show where the system can be extended.",
    related: ["runtime-vs-reference", "type-badi"],
  },
  event: {
    term: "Event / subscribe",
    short:
      "A notification SAP sends out when something happens (e.g. 'a business partner changed'). You subscribe to receive them, rather than asking for them.",
    why: "Events are consumed by subscription, not by reading — so we mark them 'Available' (published, subscribe-only), never 'read'.",
    related: ["status-available", "type-event"],
  },
  "scope-item": {
    term: "Scope item",
    short:
      "A named, pre-packaged business process SAP ships (each has a short code). It's how SAP organises 'what the system can do'.",
    why: "Scope-item codes hint at which business area a service belongs to and what has to be switched on for it to work.",
    related: ["communication-arrangement", "activation"],
  },
  "runtime-vs-reference": {
    term: "Runtime vs reference",
    short:
      "Runtime things are live endpoints you can actually call (APIs, CDS views, events). Reference things are design-time material you read about (blueprints, extension points).",
    why: "Only runtime content can be probed for a live status. Reference content is always labelled 'Reference' — useful to read, not something to connect to.",
    related: ["status-reference", "probe"],
  },
  "authorized-vs-data-confirmed": {
    term: "Authorized vs data-confirmed",
    short:
      "Authorized = the service's description ($metadata) was reachable, so the door opens. Data-confirmed = we also read one real row, proving live data actually flows.",
    why: "Reaching the description proves access; reading a row proves data. We keep them separate so the page never over-claims what it's confirmed.",
    related: ["metadata", "probe", "status-activated"],
  },

  // ── status badges (one tap from every badge) ─────────────────────────────
  "status-activated": {
    term: "Activated",
    short: "A live check reached this service and it responded OK — it's switched on and usable in your system.",
    why: "This is the only status backed by a real success. It means you can actually connect to this service today.",
    related: ["activation", "probe", "authorized-vs-data-confirmed"],
  },
  "status-needs-setup": {
    term: "Needs setup",
    short:
      "We checked and the service politely refused (not authorized). SAP offers it, but your system hasn't switched its arrangement on yet.",
    why: "It's a confirmed 'not yet' — the fix is to turn on the matching communication arrangement (SAP_COM_xxxx).",
    related: ["communication-arrangement", "status-activated"],
  },
  "status-not-checked": {
    term: "Not checked",
    short:
      "We haven't probed this one yet (checks are capped for speed), so its status is genuinely unknown — not good, not bad.",
    why: "The page never pretends to know. Open the item to run a live check and it'll resolve to a real status.",
    related: ["probe"],
  },
  "status-not-found": {
    term: "Not found",
    short: "We checked and the service's address wasn't there on this system.",
    why: "Different from 'needs setup': the path is absent, not just switched off. Often means it's not part of this tenant.",
    related: ["probe", "status-needs-setup"],
  },
  "status-available": {
    term: "Available",
    short:
      "Published as subscribe-only (an event). SAP offers it, but there's nothing to 'read' and we haven't verified your subscription.",
    why: "It's honest shorthand for 'you could subscribe to this' — not a claim that it's live in your tenant.",
    related: ["event", "type-event"],
  },
  "status-deprecated": {
    term: "Deprecated",
    short:
      "SAP has retired this item in its published catalogue (Hub State = Deprecated). It may still answer today, but SAP will not carry it forward.",
    why: "Build on the successor SAP names, not on this — a deprecated item never counts as activated, even when a probe still gets a 200.",
    related: ["probe", "status-activated"],
  },
  "status-reference": {
    term: "Reference",
    short: "Design-time material to read about (a blueprint, an extension point) — not a live service to connect to.",
    why: "Useful background, but there's nothing to probe or call, so it never carries a live status.",
    related: ["runtime-vs-reference"],
  },

  // ── content types (one tap from every tile) ──────────────────────────────
  "type-api": {
    term: "API",
    short: "A live doorway to read or write specific business data (over OData or SOAP).",
    why: "APIs are the workhorses — most of what you can actually connect to and use lives here.",
    related: ["odata", "soap", "crud"],
  },
  "type-event": {
    term: "Event",
    short: "A change notification you subscribe to, rather than a service you read.",
    why: "Great for reacting to things as they happen; not something you pull data from.",
    related: ["event", "status-available"],
  },
  "type-cds-view": {
    term: "CDS View",
    short: "A ready-made, read-only view of SAP data, usually reachable over OData.",
    why: "A rich source for reporting and reads without building anything custom.",
    related: ["cds-view", "odata"],
  },
  "type-badi": {
    term: "BAdI",
    short: "A built-in extension point for adding custom logic — reference material, not a data endpoint.",
    why: "Shows where the system can be extended; you read about it, you don't call it.",
    related: ["badi", "runtime-vs-reference"],
  },
  "type-bo-interface": {
    term: "Business Object Interface",
    short: "A description of a business object's interface — reference material for extending or integrating.",
    why: "Design-time context, not a live service to probe.",
    related: ["runtime-vs-reference"],
  },
  "type-integration": {
    term: "Integration",
    short: "A pre-built blueprint for connecting SAP to another system.",
    why: "A recipe to copy when wiring systems together — reference, not a live endpoint here.",
    related: ["runtime-vs-reference"],
  },
  "type-build": {
    term: "Build Automation",
    short: "A proven automation (e.g. a mass upload) built on SAP Build.",
    why: "Feature inspiration and ready patterns — reference material, not something to call.",
    related: ["runtime-vs-reference"],
  },
  "type-process-blueprint": {
    term: "Process Blueprint",
    short: "SAP's standard end-to-end way of running a business process.",
    why: "The 'best-practice baseline' to compare a client's way of working against.",
    related: ["runtime-vs-reference"],
  },
  "type-liveprocess": {
    term: "Live Process",
    short: "A standard end-to-end process, expressed as steps.",
    why: "Same idea as a blueprint — a reference for the standard flow.",
    related: ["type-process-blueprint"],
  },
  "type-scenario": {
    term: "Scenario",
    short: "A packaged end-to-end business scenario.",
    why: "Reference context for how pieces fit together across a process.",
    related: ["runtime-vs-reference"],
  },
  "type-vpuc": {
    term: "Partner Use Case",
    short: "A validated use case published by an SAP partner.",
    why: "Market and competitive context — what others have built and proven.",
    related: ["runtime-vs-reference"],
  },
  "type-analytics": {
    term: "Analytics",
    short: "Prebuilt dashboards / planning designs (for SAP Analytics Cloud).",
    why: "Reporting inspiration; needs SAC to actually run, so it's reference here.",
    related: ["runtime-vs-reference"],
  },
};

/** Display order for the SAP glossary drawer: concepts → statuses → types. */
export const SAP_GLOSSARY_ORDER: string[] = [
  "odata",
  "odata-v2",
  "odata-v4",
  "soap",
  "metadata",
  "communication-arrangement",
  "activation",
  "probe",
  "entity-set",
  "crud",
  "cds-view",
  "badi",
  "event",
  "scope-item",
  "runtime-vs-reference",
  "authorized-vs-data-confirmed",
  "status-activated",
  "status-needs-setup",
  "status-not-checked",
  "status-not-found",
  "status-available",
  "status-reference",
  "status-deprecated",
  "type-api",
  "type-event",
  "type-cds-view",
  "type-badi",
  "type-bo-interface",
  "type-integration",
  "type-build",
  "type-process-blueprint",
  "type-liveprocess",
  "type-scenario",
  "type-vpuc",
  "type-analytics",
];

/** Glossary id for a status badge (used for one-tap define on each badge). */
export function glossaryIdForStatus(status: string): string {
  return `status-${status.toLowerCase().replace(/_/g, "-")}`;
}

/** Glossary id for a content type (used for one-tap define on each tile). */
export function glossaryIdForContentType(type: string): string {
  return `type-${type.toLowerCase().replace(/_/g, "-")}`;
}
