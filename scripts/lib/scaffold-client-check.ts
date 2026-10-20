/**
 * Compile the starter kit's generated client.ts the way a developer's own
 * repository would: under `strict`, and under the stricter flags a careful
 * repository turns on beside it (P0.4).
 *
 * WHY THIS EXISTS. client.ts leaves the product and is compiled somewhere we
 * never see. It failed `tsc --strict` there — the parsed body was cast
 * `as typeof json`, which reads the variable's type narrowed to `null`, so
 * every later read was `never` — and nothing here noticed, because the repo's
 * own type check never compiles a generated string. This does, for a spread of
 * interfaces (template, captured, a legacy capture, hostile names), and under
 * both the DOM lib and Node's types without DOM, because a kit is used in both.
 *
 * Used by `pnpm check:scaffold-client` (a CI step) and by
 * tests/unit/studio/scaffold-client-strict.test.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import { buildTypeScriptClient, type ScaffoldInterface } from "@/lib/studio/scaffold";
import { inferResponseSchema, type CapturedSchema } from "@/lib/studio/schema-capture";

const BASE: ScaffoldInterface = {
  id: "if_check",
  name: "Business Partner read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  version: 3,
  solutionName: "Finance Accelerator",
};

/** Rows exercising every type the emitter maps, nulls, mixed types and names that need quoting. */
function sampleRows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    BusinessPartner: String(1000 + i),
    Amount: i + 0.5,
    Count: i,
    Blocked: i % 2 === 0,
    CreatedAt: "/Date(1700000000000)/",
    Remark: i % 3 === 0 ? null : "x",
    Mixed: i % 2 === 0 ? "a" : 1,
    Tags: ["a"],
    Address: { City: "Kuala Lumpur" },
    "Weird-Name": "y",
    "1stField": "z",
    to_Role: { __deferred: { uri: "https://tenant.example/sap/opu/odata/sap/X/Role" } },
  }));
}

/** A schema as capture stored it before the envelope was stripped (servedResponseSchema reconciles it). */
const LEGACY_SCHEMA: CapturedSchema = {
  type: "object",
  properties: {
    BusinessPartner: { type: "string" },
    to_BusinessPartnerAddress: { type: "object" },
    "@odata.etag": { type: "string" },
  },
  required: ["BusinessPartner", "to_BusinessPartnerAddress"],
  additionalProperties: true,
  "x-captured": { sampleSize: 20, capturedAt: "2026-07-01T00:00:00.000Z", note: "legacy" },
};

/** The interfaces whose generated client must compile. */
export function clientVariants(): { name: string; source: string }[] {
  const captured = inferResponseSchema(sampleRows(25), new Date("2026-10-01T00:00:00.000Z"), {
    version: BASE.version,
    entitySet: BASE.entitySet,
  });
  const small = inferResponseSchema(sampleRows(3), new Date("2026-10-01T00:00:00.000Z"));
  return [
    { name: "template (no schema)", source: buildTypeScriptClient(BASE) },
    { name: "captured schema, required fields", source: buildTypeScriptClient({ ...BASE, responseSchema: captured }) },
    { name: "captured schema, small sample", source: buildTypeScriptClient({ ...BASE, responseSchema: small }) },
    { name: "legacy schema", source: buildTypeScriptClient({ ...BASE, responseSchema: LEGACY_SCHEMA }) },
    {
      name: "hostile names, withheld schema",
      source: buildTypeScriptClient({
        ...BASE,
        name: "QA */ `x` <script>",
        externalId: "custom:/sap/opu/odata/sap/Z*/_SRV",
        entitySet: "9th-Set*/",
        solutionName: "S */",
        withheldSchemaNote: "Captured under an earlier contract */ of this interface.",
      }),
    },
    { name: "no entity set", source: buildTypeScriptClient({ ...BASE, entitySet: null }) },
  ];
}

const STRICTER: ts.CompilerOptions = {
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noPropertyAccessFromIndexSignature: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  // TypeScript 5.8+: refuses parameter properties, enums and namespaces.
  ...({ erasableSyntaxOnly: true } as ts.CompilerOptions),
};

const COMMON: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
};

/** The settings a developer's repository might compile it under. */
export function compilerConfigs(repoRoot: string = process.cwd()): { name: string; options: ts.CompilerOptions }[] {
  const typeRoots = [join(repoRoot, "node_modules", "@types")];
  return [
    { name: "tsc --strict (DOM)", options: { ...COMMON, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], types: [] } },
    {
      name: "strict + stricter flags (DOM)",
      options: { ...COMMON, ...STRICTER, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], types: [] },
    },
    {
      name: "strict + stricter flags (Node types, no DOM)",
      options: { ...COMMON, ...STRICTER, lib: ["lib.es2022.d.ts"], types: ["node"], typeRoots },
    },
  ];
}

/** Compile one generated source under one configuration; the diagnostics, formatted. */
export function compileClient(source: string, options: ts.CompilerOptions): string[] {
  const fileName = join(process.cwd(), "__generated__", "client.ts");
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
    name === fileName
      ? ts.createSourceFile(name, source, languageVersion, true)
      : getSourceFile(name, languageVersion, onError, shouldCreate);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === fileName || fileExists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => (name === fileName ? source : readFile(name));

  const program = ts.createProgram([fileName], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return diagnostics.map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (!d.file || d.start === undefined) return `TS${d.code}: ${message}`;
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${d.file.fileName === fileName ? "client.ts" : d.file.fileName}(${line + 1},${character + 1}): TS${d.code}: ${message}`;
  });
}

export interface ClientCheckFailure {
  variant: string;
  config: string;
  diagnostics: string[];
}

/** Every variant under every configuration; an empty list means all compiled cleanly. */
export function checkGeneratedClients(repoRoot: string = process.cwd()): ClientCheckFailure[] {
  // Fail loudly if the Node types the third configuration names are missing,
  // rather than reporting a confusing "cannot find type definition".
  readFileSync(join(repoRoot, "node_modules", "@types", "node", "package.json"), "utf8");
  const failures: ClientCheckFailure[] = [];
  for (const variant of clientVariants()) {
    for (const config of compilerConfigs(repoRoot)) {
      const diagnostics = compileClient(variant.source, config.options);
      if (diagnostics.length > 0) failures.push({ variant: variant.name, config: config.name, diagnostics });
    }
  }
  return failures;
}
