import { PrismaClient } from "@prisma/client";

interface CheckResult {
  name: string;
  actual: number;
  expected: number;
  pass: boolean;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    const results: CheckResult[] = [];

    // Check 1: Scope items count
    const scopeItemCount = await prisma.scopeItem.count();
    results.push({
      name: "Scope items",
      actual: scopeItemCount,
      expected: 550,
      pass: scopeItemCount === 550,
    });

    // Check 2: Process steps count
    const processStepCount = await prisma.processStep.count();
    results.push({
      name: "Process steps",
      actual: processStepCount,
      expected: 102261,
      pass: processStepCount === 102261,
    });

    // Check 3: Config activities count
    const configCount = await prisma.configActivity.count();
    results.push({
      name: "Config activities",
      actual: configCount,
      expected: 4703,
      pass: configCount === 4703,
    });

    // Check 4: Config categories breakdown
    const mandatoryCount = await prisma.configActivity.count({
      where: { category: "Mandatory" },
    });
    const recommendedCount = await prisma.configActivity.count({
      where: { category: "Recommended" },
    });
    const optionalCount = await prisma.configActivity.count({
      where: { category: "Optional" },
    });
    const otherCatCount = await prisma.configActivity.count({
      where: { category: { notIn: ["Mandatory", "Recommended", "Optional"] } },
    });
    const catTotal = mandatoryCount + recommendedCount + optionalCount + otherCatCount;
    results.push({
      name: `Config categories: Mandatory=${mandatoryCount}, Recommended=${recommendedCount}, Optional=${optionalCount}, Other=${otherCatCount}`,
      actual: catTotal,
      expected: 4703,
      pass:
        mandatoryCount === 591 &&
        recommendedCount === 1491 &&
        optionalCount === 2604 &&
        otherCatCount === 17,
    });

    // Check 5: Self-service configs
    const selfServiceYes = await prisma.configActivity.count({
      where: { selfService: true },
    });
    const selfServiceNo = await prisma.configActivity.count({
      where: { selfService: false },
    });
    results.push({
      name: `Self-service configs: Yes=${selfServiceYes}, No=${selfServiceNo}`,
      actual: selfServiceYes + selfServiceNo,
      expected: 4703,
      pass: selfServiceYes === 4690 && selfServiceNo === 13,
    });

    // Check 6: IMG activities count
    const imgCount = await prisma.imgActivity.count();
    results.push({
      name: "IMG activities",
      actual: imgCount,
      expected: 4451,
      pass: imgCount === 4451,
    });

    // Check 7: Setup guides count
    const setupCount = await prisma.setupGuide.count();
    results.push({
      name: "Setup guides",
      actual: setupCount,
      expected: 230,
      pass: setupCount === 230,
    });

    // Check 8: General files count
    const generalCount = await prisma.generalFile.count();
    results.push({
      name: "General files",
      actual: generalCount,
      expected: 162,
      pass: generalCount === 162,
    });

    // Check 9: Solution links (scenario)
    const scenarioLinks = await prisma.solutionLink.count({
      where: { type: "scenario" },
    });
    results.push({
      name: "Solution links (scenario)",
      actual: scenarioLinks,
      expected: 32,
      pass: scenarioLinks === 32,
    });

    // Check 10: Solution links (process)
    const processLinks = await prisma.solutionLink.count({
      where: { type: "process" },
    });
    results.push({
      name: "Solution links (process)",
      actual: processLinks,
      expected: 163,
      pass: processLinks === 163,
    });

    // Check 11: Expert configs
    const expertCount = await prisma.expertConfig.count();
    results.push({
      name: "Expert configs",
      actual: expertCount,
      expected: 13,
      pass: expertCount === 13,
    });

    // Check 12: Orphaned steps (steps with no valid scope item)
    const orphanedSteps = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT COUNT(*) as count FROM "ProcessStep" ps LEFT JOIN "ScopeItem" si ON ps."scopeItemId" = si.id WHERE si.id IS NULL`;
    const orphanStepCount = Number(orphanedSteps[0]?.count ?? 0);
    results.push({
      name: "Orphaned steps",
      actual: orphanStepCount,
      expected: 0,
      pass: orphanStepCount === 0,
    });

    // Check 13: Orphaned configs (configs with no valid scope item)
    const orphanedConfigs = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT COUNT(*) as count FROM "ConfigActivity" ca LEFT JOIN "ScopeItem" si ON ca."scopeItemId" = si.id WHERE si.id IS NULL`;
    const orphanConfigCount = Number(orphanedConfigs[0]?.count ?? 0);
    results.push({
      name: "Orphaned configs",
      actual: orphanConfigCount,
      expected: 0,
      pass: orphanConfigCount === 0,
    });

    // Print results
    let allPassed = true;
    for (const result of results) {
      const icon = result.pass ? "\u2713" : "\u2717";
      console.log(`${icon} ${result.name}: ${result.actual} (expected ${result.expected})`);
      if (!result.pass) {
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log("\n\u2713 All checks passed!");
    } else {
      console.log("\n\u2717 Some checks failed!");
      process.exit(1);
    }
  } catch (error) {
    console.error("Data verification failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
