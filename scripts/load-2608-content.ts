/**
 * WS11 — load the 2608 workbooks that shipped in the drop and had no loader.
 *
 * Forms, enterprise structure, G/L accounts, controlling and financial master
 * objects, tax codes with their rates and account determination, and the
 * pre-delivered fiscal year variants. Seven files, eight tables, one command:
 * they arrived in the same drop and there is no reason to run them apart.
 *
 * Every table is release-scoped and every load is idempotent — the release's
 * rows are deleted and re-created inside one transaction, exactly as WS1 does
 * for ConfigActivity. Nothing outside the 2608 release is read or written.
 *
 * Usage:  pnpm sap:2608:load-content [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { ensureContentRelease, integrityGate } from "./lib/sap-2608/db";
import {
  parseCoMasterObjects,
  parseFiscalYearVariants,
  parseForms,
  parseGlAccounts,
  parseOrgStructure,
  parseTaxAccountAssignments,
  parseTaxCodes,
  parseTaxRates,
} from "./lib/sap-2608/parse-content";

const RELEASE = "2608" as const;
const SOURCES = sapContentSourcesFor(RELEASE);
const BATCH = 500;

/**
 * The Malaysia variant of the account and tax files. Stored on the row rather
 * than inferred from the release, so a later load of the global YCOA sits
 * beside this one instead of overwriting it.
 */
const COUNTRY_VARIANT = "MY";

/* Prisma's interactive transactions default to 5 seconds — ample locally, far
 * too little against a managed database. WS1 learned this the hard way when
 * 4,328 rows in batches of 500 took 5.2s against Neon and the transaction
 * expired mid-load. These loaders are meant to be run against production. */
const TX = { maxWait: 30_000, timeout: 120_000 } as const;

function chunk<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

async function main(): Promise<number> {
  const dryRun = process.argv.includes("--dry-run");
  const gate = integrityGate(SOURCES);
  if (!gate.ok) {
    console.error("load-2608-content: refused — manifest integrity findings:");
    for (const f of gate.findings) console.error(`  ! ${f}`);
    return 1;
  }

  const forms = await parseForms(SOURCES);
  const org = await parseOrgStructure(SOURCES);
  const glAccounts = await parseGlAccounts(SOURCES);
  const coObjects = await parseCoMasterObjects(SOURCES);
  const taxCodes = await parseTaxCodes(SOURCES);
  const taxRates = await parseTaxRates(SOURCES);
  const taxAccounts = await parseTaxAccountAssignments(SOURCES);
  const fyvs = await parseFiscalYearVariants(SOURCES);

  const formsWithScope = forms.filter((f) => f.scopeItemCodes.length > 0).length;
  const formScopeCodes = new Set(forms.flatMap((f) => f.scopeItemCodes));
  const byObjectType = new Map<string, number>();
  for (const r of coObjects) byObjectType.set(r.objectType, (byObjectType.get(r.objectType) ?? 0) + 1);

  console.log(`load-2608-content — release ${RELEASE}`);
  console.log(`  forms                 ${forms.length} (${formsWithScope} carry a scope code, ${formScopeCodes.size} distinct codes cited)`);
  console.log(`  org structure         ${org.length} elements across ${new Set(org.map((o) => o.elementType)).size} types`);
  console.log(`  G/L accounts          ${glAccounts.length} (${COUNTRY_VARIANT} local chart)`);
  console.log(`  CO/FI master objects  ${coObjects.length}`);
  for (const [t, n] of [...byObjectType].sort()) console.log(`     ${t.padEnd(24)} ${n}`);
  console.log(`  tax codes             ${taxCodes.length} · rates ${taxRates.length} · account determination ${taxAccounts.length}`);
  console.log(`  fiscal year variants  ${fyvs.length} (${fyvs.filter((f) => f.corporateFyvCapable === "Yes").length} usable as a corporate FYV)`);

  if (forms.length === 0 || glAccounts.length === 0) {
    console.error("  ! refused: a source parsed to zero rows, which means the sheet moved, not that SAP shipped nothing");
    return 1;
  }
  if (dryRun) {
    console.log("  dry-run: no database write");
    return 0;
  }

  const prisma = new PrismaClient();
  try {
    const release = await ensureContentRelease(prisma, SOURCES, gate);
    const rid = release.id;

    await prisma.$transaction(async (tx) => {
      await tx.sapFormTemplate.deleteMany({ where: { releaseId: rid } });
      for (const batch of chunk(forms)) {
        await tx.sapFormTemplate.createMany({
          data: batch.map((f) => ({
            applicationArea: f.applicationArea,
            name: f.name,
            applicationObject: f.applicationObject,
            adobeFormTemplate: f.adobeFormTemplate,
            outputType: f.outputType,
            callbackClass: f.callbackClass,
            relevantFor: f.relevantFor,
            scopeItemCodes: f.scopeItemCodes,
            rawUse: f.rawUse || null,
            rawUsedInSi: f.rawUsedInSi || null,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.sapOrgStructureElement.deleteMany({ where: { releaseId: rid } });
      for (const batch of chunk(org)) {
        await tx.sapOrgStructureElement.createMany({
          data: batch.map((o) => ({
            elementType: o.elementType,
            code: o.code,
            areaLabel: o.areaLabel || null,
            sheetName: o.sheetName,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.sapGlAccount.deleteMany({ where: { releaseId: rid } });
      for (const batch of chunk(glAccounts)) {
        await tx.sapGlAccount.createMany({
          data: batch.map((a) => ({
            chartOfAccounts: a.chartOfAccounts,
            companyCode: a.companyCode,
            accountNumber: a.accountNumber,
            longTextEn: a.longTextEn,
            glAccountType: a.glAccountType || null,
            balanceSheetAccount: a.balanceSheetAccount || null,
            groupAccountNumber: a.groupAccountNumber || null,
            plStatementAcctType: a.plStatementAcctType || null,
            accountGroup: a.accountGroup || null,
            tradingPartner: a.tradingPartner || null,
            functionalArea: a.functionalArea || null,
            planningGroup: a.planningGroup || null,
            countryVariant: COUNTRY_VARIANT,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.sapCoMasterObject.deleteMany({ where: { releaseId: rid } });
      for (const batch of chunk(coObjects)) {
        await tx.sapCoMasterObject.createMany({
          data: batch.map((c) => ({
            objectType: c.objectType,
            controllingArea: c.controllingArea,
            code: c.code,
            name: c.name || null,
            category: c.category || null,
            hierarchy: c.hierarchy || null,
            functionalArea: c.functionalArea || null,
            country: c.country || null,
            level: c.level,
            sourceRow: c.sourceRow,
            releaseId: rid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.sapTaxCode.deleteMany({ where: { releaseId: rid } });
      await tx.sapTaxCode.createMany({
        data: taxCodes.map((t) => ({
          country: t.country,
          taxCode: t.taxCode,
          description: t.description,
          descriptionLocal: t.descriptionLocal || null,
          taxType: t.taxType || null,
          euCode: t.euCode || null,
          errorIndicator: t.errorIndicator || null,
          releaseId: rid,
        })),
        skipDuplicates: true,
      });

      await tx.sapTaxRate.deleteMany({ where: { releaseId: rid } });
      await tx.sapTaxRate.createMany({
        data: taxRates.map((t) => ({
          country: t.country,
          taxCode: t.taxCode,
          validFrom: t.validFrom,
          conditionType: t.conditionType,
          rate: t.rate,
          releaseId: rid,
        })),
        skipDuplicates: true,
      });

      await tx.sapTaxAccountAssignment.deleteMany({ where: { releaseId: rid } });
      await tx.sapTaxAccountAssignment.createMany({
        data: taxAccounts.map((t) => ({
          taxCode: t.taxCode,
          description: t.description || null,
          transactionKey: t.transactionKey,
          glAccount: t.glAccount,
          countryVariant: COUNTRY_VARIANT,
          releaseId: rid,
        })),
        skipDuplicates: true,
      });

      await tx.sapFiscalYearVariant.deleteMany({ where: { releaseId: rid } });
      await tx.sapFiscalYearVariant.createMany({
        data: fyvs.map((f) => ({
          variant: f.variant,
          description: f.description,
          postingPeriods: f.postingPeriods,
          specialPeriods: f.specialPeriods,
          calendarYearDependent: f.calendarYearDependent || null,
          corporateFyvCapable: f.corporateFyvCapable || null,
          origin: f.origin || null,
          remarks: f.remarks || null,
          releaseId: rid,
        })),
        skipDuplicates: true,
      });
    }, TX);

    const [dbForms, dbOrg, dbGl, dbCo, dbTax, dbRates, dbTaxAcct, dbFyv] = await Promise.all([
      prisma.sapFormTemplate.count({ where: { releaseId: rid } }),
      prisma.sapOrgStructureElement.count({ where: { releaseId: rid } }),
      prisma.sapGlAccount.count({ where: { releaseId: rid } }),
      prisma.sapCoMasterObject.count({ where: { releaseId: rid } }),
      prisma.sapTaxCode.count({ where: { releaseId: rid } }),
      prisma.sapTaxRate.count({ where: { releaseId: rid } }),
      prisma.sapTaxAccountAssignment.count({ where: { releaseId: rid } }),
      prisma.sapFiscalYearVariant.count({ where: { releaseId: rid } }),
    ]);
    console.log(
      `  db: forms ${dbForms} · org ${dbOrg} · gl ${dbGl} · co ${dbCo} · tax ${dbTax} · rates ${dbRates} · taxAcct ${dbTaxAcct} · fyv ${dbFyv}`,
    );
    /* A row lost to skipDuplicates is a real finding, not a tidy-up: it means
     * the source carries two rows the unique key cannot tell apart. Loud. */
    const expected: [string, number, number][] = [
      ["forms", forms.length, dbForms],
      ["org", org.length, dbOrg],
      ["glAccounts", glAccounts.length, dbGl],
      ["coObjects", coObjects.length, dbCo],
      ["taxCodes", taxCodes.length, dbTax],
      ["taxRates", taxRates.length, dbRates],
      ["taxAccounts", taxAccounts.length, dbTaxAcct],
      ["fiscalYearVariants", fyvs.length, dbFyv],
    ];
    let ok = true;
    for (const [name, parsed, stored] of expected) {
      if (parsed !== stored) {
        ok = false;
        console.error(`  ! ${name}: parsed ${parsed}, stored ${stored} — ${parsed - stored} row(s) collided on the unique key`);
      }
    }
    return ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
