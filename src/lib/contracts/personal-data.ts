/**
 * How much of a service description carries personal-data annotations — the
 * measurement P1.5 decides on: whether field grants can be driven by SAP's
 * PersonalData vocabulary [E46], or need name and type heuristics beside it.
 *
 * Counted, never listed: the corpus job (scripts/contract-corpus.ts) prints
 * these numbers for SAP's own descriptions and nothing else from them.
 */

import type { ContractIR, IrProperty } from "@/lib/contracts/ir";

/** V2 `sap:semantics` values (vCard and SAP's own) that name a person or how to reach one. */
export const PERSONAL_SEMANTICS: ReadonlySet<string> = new Set([
  "name",
  "givenname",
  "familyname",
  "middlename",
  "nickname",
  "honorific",
  "suffix",
  "email",
  "tel",
  "bday",
  "photo",
  "street",
  "city",
  "zip",
  "pobox",
  "region",
  "country",
  "geo-lat",
  "geo-lon",
  "note",
]);

export interface PersonalDataCoverage {
  entityTypes: number;
  /** Entity types annotated with PersonalData.EntitySemantics. */
  entityTypesWithSemantics: number;
  properties: number;
  /** Properties carrying any PersonalData term. */
  annotatedProperties: number;
  potentiallyPersonal: number;
  potentiallySensitive: number;
  withFieldSemantics: number;
  /** Properties whose V2 sap:semantics names a person (a signal, not an annotation). */
  personalSemantics: number;
}

function semanticsIsPersonal(p: IrProperty): boolean {
  // "tel;type=work" and "email;type=pref" carry a qualifier after the name.
  const head = p.semantics?.split(";")[0]?.trim().toLowerCase();
  return head !== undefined && PERSONAL_SEMANTICS.has(head);
}

export function personalDataCoverage(ir: ContractIR): PersonalDataCoverage {
  const c: PersonalDataCoverage = {
    entityTypes: ir.entityTypes.length,
    entityTypesWithSemantics: ir.entityTypes.filter((t) => t.personalData?.entitySemantics !== undefined).length,
    properties: 0,
    annotatedProperties: 0,
    potentiallyPersonal: 0,
    potentiallySensitive: 0,
    withFieldSemantics: 0,
    personalSemantics: 0,
  };
  for (const t of [...ir.entityTypes, ...ir.complexTypes]) {
    for (const p of t.properties) {
      c.properties += 1;
      if (p.personalData) c.annotatedProperties += 1;
      if (p.personalData?.isPotentiallyPersonal) c.potentiallyPersonal += 1;
      if (p.personalData?.isPotentiallySensitive) c.potentiallySensitive += 1;
      if (p.personalData?.fieldSemantics) c.withFieldSemantics += 1;
      if (semanticsIsPersonal(p)) c.personalSemantics += 1;
    }
  }
  return c;
}

export function addCoverage(a: PersonalDataCoverage, b: PersonalDataCoverage): PersonalDataCoverage {
  return {
    entityTypes: a.entityTypes + b.entityTypes,
    entityTypesWithSemantics: a.entityTypesWithSemantics + b.entityTypesWithSemantics,
    properties: a.properties + b.properties,
    annotatedProperties: a.annotatedProperties + b.annotatedProperties,
    potentiallyPersonal: a.potentiallyPersonal + b.potentiallyPersonal,
    potentiallySensitive: a.potentiallySensitive + b.potentiallySensitive,
    withFieldSemantics: a.withFieldSemantics + b.withFieldSemantics,
    personalSemantics: a.personalSemantics + b.personalSemantics,
  };
}

export const EMPTY_COVERAGE: PersonalDataCoverage = {
  entityTypes: 0,
  entityTypesWithSemantics: 0,
  properties: 0,
  annotatedProperties: 0,
  potentiallyPersonal: 0,
  potentiallySensitive: 0,
  withFieldSemantics: 0,
  personalSemantics: 0,
};
