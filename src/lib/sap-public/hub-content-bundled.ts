/**
 * Build-time bundle of the per-type Hub drop targets, so the admin Rebuild
 * endpoint can populate non-API content types in PROD without any DB secret
 * leaving Vercel (static imports are deterministically traced into the function).
 *
 * GUARD — only SMALL types are bundled. High-volume types (CDS_VIEW ~9k, BADI
 * ~1.6k) are deliberately EXCLUDED so a large export can never be baked into the
 * serverless function; they stay count-only reference tiles (populate a dev DB
 * via `pnpm sap:hub:import` if ever needed). API comes from SapApiReference.
 *
 * Files ship empty (`[]`); a real export takes effect after commit + deploy.
 */
import type { HubContentType } from "@/lib/sap-public/hub-content";

import EVENT from "../../../sap-references/hub-content/EVENT.json";
import BO_INTERFACE from "../../../sap-references/hub-content/BO_INTERFACE.json";
import INTEGRATION from "../../../sap-references/hub-content/INTEGRATION.json";
import BUILD from "../../../sap-references/hub-content/BUILD.json";
import PROCESS_BLUEPRINT from "../../../sap-references/hub-content/PROCESS_BLUEPRINT.json";
import LIVEPROCESS from "../../../sap-references/hub-content/LIVEPROCESS.json";
import SCENARIO from "../../../sap-references/hub-content/SCENARIO.json";
import VPUC from "../../../sap-references/hub-content/VPUC.json";
import ANALYTICS from "../../../sap-references/hub-content/ANALYTICS.json";

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

/** Content types the admin endpoint can import (small enough to bundle). */
export const BUNDLED_HUB_TYPES: HubContentType[] = [
  "EVENT",
  "BO_INTERFACE",
  "INTEGRATION",
  "BUILD",
  "PROCESS_BLUEPRINT",
  "LIVEPROCESS",
  "SCENARIO",
  "VPUC",
  "ANALYTICS",
];

/** Content types intentionally NOT bundled (count-only; too large to bake in). */
export const COUNT_ONLY_HUB_TYPES: HubContentType[] = ["CDS_VIEW", "BADI"];

export const BUNDLED_HUB_CONTENT: Record<string, Row[]> = {
  EVENT: rows(EVENT),
  BO_INTERFACE: rows(BO_INTERFACE),
  INTEGRATION: rows(INTEGRATION),
  BUILD: rows(BUILD),
  PROCESS_BLUEPRINT: rows(PROCESS_BLUEPRINT),
  LIVEPROCESS: rows(LIVEPROCESS),
  SCENARIO: rows(SCENARIO),
  VPUC: rows(VPUC),
  ANALYTICS: rows(ANALYTICS),
};
