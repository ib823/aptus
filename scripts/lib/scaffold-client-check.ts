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

import { compileContract } from "@/lib/contracts/compile";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { sliceForEntitySet } from "@/lib/contracts/slice";
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

/**
 * Compiled contracts (P1.3): every type mapping the emitter has, names that
 * need quoting, a label carrying a comment terminator, enums and complex types.
 */
const COMPILED_V2 =
  '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:sap="http://www.sap.com/Protocols/SAPData">' +
  '<edmx:DataServices><Schema Namespace="CHK" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">' +
  '<EntityType Name="T"><Key><PropertyRef Name="BusinessPartner"/></Key>' +
  '<Property Name="BusinessPartner" Type="Edm.String" Nullable="false" sap:label="Partner */ x"/>' +
  '<Property Name="Amount" Type="Edm.Decimal" Precision="15" Scale="2"/><Property Name="Big" Type="Edm.Int64"/>' +
  '<Property Name="Count" Type="Edm.Int32" Nullable="false"/><Property Name="Blocked" Type="Edm.Boolean"/>' +
  '<Property Name="CreatedAt" Type="Edm.DateTime"/><Property Name="At" Type="Edm.Time"/><Property Name="Id" Type="Edm.Guid"/>' +
  '<Property Name="Weird-Name" Type="Edm.String"/><Property Name="Rate" Type="Edm.Double"/></EntityType>' +
  '<EntityContainer Name="C"><EntitySet Name="A_BusinessPartner" EntityType="CHK.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';

const COMPILED_V4 =
  '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
  '<Schema Namespace="chk" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
  '<EnumType Name="Status"><Member Name="Open"/><Member Name="Closed"/></EnumType>' +
  '<EnumType Name="Flags" IsFlags="true"><Member Name="A" Value="1"/></EnumType>' +
  '<ComplexType Name="Money"><Property Name="Amount" Type="Edm.Decimal"/></ComplexType>' +
  '<EntityType Name="T"><Key><PropertyRef Name="BusinessPartner"/></Key>' +
  '<Property Name="BusinessPartner" Type="Edm.String" Nullable="false"/><Property Name="Status" Type="chk.Status"/>' +
  '<Property Name="Flags" Type="chk.Flags"/><Property Name="Net" Type="chk.Money"/><Property Name="Tags" Type="Collection(Edm.String)"/>' +
  '<Property Name="States" Type="Collection(chk.Status)"/><Property Name="Big" Type="Edm.Int64"/><Property Name="On" Type="Edm.Date"/>' +
  '<Property Name="Any" Type="Edm.Untyped"/><Property Name="1stField" Type="Edm.String"/></EntityType>' +
  '<EntityContainer Name="C"><EntitySet Name="A_BusinessPartner" EntityType="chk.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';

function compiled(xml: string): NonNullable<ScaffoldInterface["compiled"]> {
  const r = compileContract(xml);
  if (!r.ok) throw new Error(`scaffold-client-check: ${r.detail}`);
  const s = sliceForEntitySet(r.ir, "A_BusinessPartner");
  if (!s.ok) throw new Error(`scaffold-client-check: ${s.detail}`);
  const contract: InterfaceContract = s.contract;
  return { semver: "1.0.0", snapshotId: "snap_check", contentHash: "0".repeat(64), compiledAt: "2026-10-20T00:00:00.000Z", contract };
}

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
    { name: "compiled contract, V2", source: buildTypeScriptClient({ ...BASE, compiled: compiled(COMPILED_V2) }) },
    { name: "compiled contract, V4", source: buildTypeScriptClient({ ...BASE, compiled: compiled(COMPILED_V4) }) },
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
