/**
 * The Contract Compiler, run over one real service description — the pure half
 * of the corpus job (scripts/contract-corpus.ts), unit-tested on the
 * repository's own fixtures so the network half has nothing to get wrong.
 *
 * Returns NUMBERS ONLY. The description is SAP's; it is parsed in memory and
 * dropped, and nothing about its content — no type, property or label name —
 * leaves this function (docs/runbooks/coreedge-contract-compiler.md, "the corpus job").
 */

import { compileContract } from "@/lib/contracts/compile";
import { buildNorthboundOpenApi } from "@/lib/contracts/openapi";
import { personalDataCoverage, type PersonalDataCoverage } from "@/lib/contracts/personal-data";
import { sliceForEntitySet } from "@/lib/contracts/slice";

import { validateOpenApi30, validateOpenApi31 } from "../../tests/helpers/openapi-validate";

export interface DescriptionReport {
  compiled: boolean;
  /** The compiler's refusal code when it did not compile (never its detail). */
  refusal: string | null;
  odataVersion: "V2" | "V4" | null;
  entitySets: number;
  /** Entity sets whose read and write documents both validated, in both OpenAPI versions. */
  documentsValid: number;
  /** Entity sets for which a document failed validation. */
  documentsInvalid: number;
  coverage: PersonalDataCoverage | null;
  compileMs: number;
}

export function evaluateDescription(text: string, now: () => number = () => performance.now()): DescriptionReport {
  const started = now();
  const r = compileContract(text);
  const compileMs = Math.round(now() - started);
  if (!r.ok) {
    return {
      compiled: false,
      refusal: r.reason,
      odataVersion: null,
      entitySets: 0,
      documentsValid: 0,
      documentsInvalid: 0,
      coverage: null,
      compileMs,
    };
  }
  let documentsValid = 0;
  let documentsInvalid = 0;
  for (const set of r.ir.entitySets) {
    if (set.singleton) continue;
    const slice = sliceForEntitySet(r.ir, set.name);
    if (!slice.ok) {
      documentsInvalid += 1;
      continue;
    }
    let ok = true;
    for (const version of ["3.1.0", "3.0.3"] as const) {
      const doc = buildNorthboundOpenApi({
        version,
        baseUrl: "https://coreedge.example/api/northbound",
        title: "Corpus",
        description: "Corpus check",
        infoVersion: "1.0.0",
        interfaces: [
          { id: "if_read", name: "read", externalId: "corpus", sapProduct: "s4hana", operation: "READ", mode: "READ", entitySet: set.name, version: 1, contract: { source: "metadata", contract: slice.contract, semver: "1.0.0" } },
          { id: "if_create", name: "create", externalId: "corpus", sapProduct: "s4hana", operation: "CREATE", mode: "WRITE", entitySet: set.name, version: 1, contract: { source: "metadata", contract: slice.contract, semver: "1.0.0" } },
        ],
        discovery: true,
      });
      const v = version === "3.1.0" ? validateOpenApi31(doc) : validateOpenApi30(doc);
      if (!v.valid) ok = false;
    }
    if (ok) documentsValid += 1;
    else documentsInvalid += 1;
  }
  return {
    compiled: true,
    refusal: null,
    odataVersion: r.ir.odataVersion,
    entitySets: r.ir.entitySets.length,
    documentsValid,
    documentsInvalid,
    coverage: personalDataCoverage(r.ir),
    compileMs,
  };
}
