/**
 * SAP-named successors for deprecated Hub artefacts (2608 WS2).
 *
 * The anonymous catalogue exposes an artefact's State but no Successors field,
 * so the successor of a DEPRECATED API is recorded by hand in
 * sap-references/api-successors.json — only where SAP names it (KBA, What's
 * New, or the live Hub page). This module is the one reader of that file; the
 * importers stamp `successorExternalId` from it and never infer a successor
 * from a name pattern.
 *
 * Statically imported: the file is a few KB and the admin Rebuild endpoint
 * (a serverless function) must resolve successors without a database secret
 * leaving Vercel — the same reason hub-content-bundled.ts exists.
 */

import successorsFile from "../../../sap-references/api-successors.json";

export type SuccessorEntry = {
  externalId: string;
  successor: string;
  successorProtocol?: string;
  communicationScenario?: string;
  also?: string[];
  note?: string;
};

type SuccessorsFile = {
  apis?: SuccessorEntry[];
  communicationScenarios?: SuccessorEntry[];
};

const FILE = successorsFile as SuccessorsFile;

function buildMap(entries: SuccessorEntry[] | undefined): ReadonlyMap<string, SuccessorEntry> {
  const m = new Map<string, SuccessorEntry>();
  for (const e of entries ?? []) if (e.externalId && e.successor) m.set(e.externalId.toUpperCase(), e);
  return m;
}

export const API_SUCCESSORS: ReadonlyMap<string, SuccessorEntry> = buildMap(FILE.apis);
export const COMM_SCENARIO_SUCCESSORS: ReadonlyMap<string, SuccessorEntry> = buildMap(FILE.communicationScenarios);

/** The SAP-named successor for an API / event externalId, or null. Case-insensitive. */
export function successorFor(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  return API_SUCCESSORS.get(externalId.toUpperCase())?.successor ?? null;
}
