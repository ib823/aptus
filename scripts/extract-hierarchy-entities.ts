/**
 * Hierarchy Entity Extraction Script — idempotent, safe to re-run
 *
 * Extracts SolutionProcess, ProcessFlow, and Activity entities from
 * the flat ProcessStep columns, then backfills FK references.
 *
 * 5-pass approach:
 *   Pass 1: SolutionProcess (DISTINCT solutionProcessName per scopeItem)
 *   Pass 2: ProcessFlow (DISTINCT solutionProcessFlowName per SolutionProcess)
 *   Pass 3: Activity (DISTINCT activityTitle per ProcessFlow)
 *   Pass 4: Backfill ProcessStep.activityId
 *   Pass 5: Backfill ProcessFlowDiagram.processFlowId
 *
 * Usage: npx tsx scripts/extract-hierarchy-entities.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

async function main() {
  console.log("=== Hierarchy Entity Extraction ===\n");

  // -----------------------------------------------------------------------
  // Pass 1: SolutionProcess
  // -----------------------------------------------------------------------
  console.log("--- Pass 1: Extracting SolutionProcess entities ---");

  const distinctProcesses = await prisma.$queryRaw<
    Array<{ scopeItemId: string; solutionProcessName: string | null; solutionProcessGuid: string | null; minSeq: number }>
  >`
    SELECT "scopeItemId",
           "solutionProcessName",
           MIN("solutionProcessGuid") AS "solutionProcessGuid",
           MIN("sequence") AS "minSeq"
    FROM "ProcessStep"
    GROUP BY "scopeItemId", "solutionProcessName"
    ORDER BY "scopeItemId", MIN("sequence")
  `;

  let spCreated = 0;
  let spSkipped = 0;

  for (const row of distinctProcesses) {
    const name = row.solutionProcessName ?? "__main_process__";
    try {
      await prisma.solutionProcess.upsert({
        where: {
          scopeItemId_name: {
            scopeItemId: row.scopeItemId,
            name,
          },
        },
        create: {
          scopeItemId: row.scopeItemId,
          name,
          guid: row.solutionProcessGuid,
          sequence: row.minSeq,
        },
        update: {},
      });
      spCreated++;
    } catch {
      spSkipped++;
    }
  }

  console.log(`  SolutionProcess: ${spCreated} upserted, ${spSkipped} skipped`);

  // -----------------------------------------------------------------------
  // Pass 2: ProcessFlow
  // -----------------------------------------------------------------------
  console.log("--- Pass 2: Extracting ProcessFlow entities ---");

  const allSolutionProcesses = await prisma.solutionProcess.findMany({
    select: { id: true, scopeItemId: true, name: true },
  });
  const spMap = new Map<string, string>(); // "scopeItemId::processName" → spId
  for (const sp of allSolutionProcesses) {
    spMap.set(`${sp.scopeItemId}::${sp.name}`, sp.id);
  }

  const distinctFlows = await prisma.$queryRaw<
    Array<{
      scopeItemId: string;
      solutionProcessName: string | null;
      solutionProcessFlowName: string | null;
      solutionProcessFlowGuid: string | null;
      flowDiagramGuid: string | null;
      flowDiagramName: string | null;
      minSeq: number;
    }>
  >`
    SELECT "scopeItemId",
           "solutionProcessName",
           "solutionProcessFlowName",
           MIN("solutionProcessFlowGuid") AS "solutionProcessFlowGuid",
           MIN("flowDiagramGuid") AS "flowDiagramGuid",
           MIN("flowDiagramName") AS "flowDiagramName",
           MIN("sequence") AS "minSeq"
    FROM "ProcessStep"
    GROUP BY "scopeItemId", "solutionProcessName", "solutionProcessFlowName"
    ORDER BY "scopeItemId", MIN("sequence")
  `;

  let pfCreated = 0;
  let pfSkipped = 0;

  for (const row of distinctFlows) {
    const processName = row.solutionProcessName ?? "__main_process__";
    const flowName = row.solutionProcessFlowName ?? "__main_flow__";
    const spId = spMap.get(`${row.scopeItemId}::${processName}`);
    if (!spId) {
      pfSkipped++;
      continue;
    }

    try {
      await prisma.processFlow.upsert({
        where: {
          solutionProcessId_name: {
            solutionProcessId: spId,
            name: flowName,
          },
        },
        create: {
          solutionProcessId: spId,
          name: flowName,
          guid: row.solutionProcessFlowGuid,
          flowDiagramGuid: row.flowDiagramGuid,
          flowDiagramName: row.flowDiagramName,
          sequence: row.minSeq,
        },
        update: {},
      });
      pfCreated++;
    } catch {
      pfSkipped++;
    }
  }

  console.log(`  ProcessFlow: ${pfCreated} upserted, ${pfSkipped} skipped`);

  // -----------------------------------------------------------------------
  // Pass 3: Activity
  // -----------------------------------------------------------------------
  console.log("--- Pass 3: Extracting Activity entities ---");

  // Rebuild a flow lookup: "scopeItemId::processName::flowName" → pfId
  const allProcessFlows = await prisma.processFlow.findMany({
    select: { id: true, solutionProcessId: true, name: true },
  });
  const spIdToScopeProcess = new Map<string, { scopeItemId: string; name: string }>();
  for (const sp of allSolutionProcesses) {
    spIdToScopeProcess.set(sp.id, { scopeItemId: sp.scopeItemId, name: sp.name });
  }
  const pfMap = new Map<string, string>();
  for (const pf of allProcessFlows) {
    const sp = spIdToScopeProcess.get(pf.solutionProcessId);
    if (sp) {
      pfMap.set(`${sp.scopeItemId}::${sp.name}::${pf.name}`, pf.id);
    }
  }

  const distinctActivities = await prisma.$queryRaw<
    Array<{
      scopeItemId: string;
      solutionProcessName: string | null;
      solutionProcessFlowName: string | null;
      activityTitle: string | null;
      activityGuid: string | null;
      activityTargetName: string | null;
      activityTargetUrl: string | null;
      minSeq: number;
    }>
  >`
    SELECT "scopeItemId",
           "solutionProcessName",
           "solutionProcessFlowName",
           "activityTitle",
           MIN("activityGuid") AS "activityGuid",
           MIN("activityTargetName") AS "activityTargetName",
           MIN("activityTargetUrl") AS "activityTargetUrl",
           MIN("sequence") AS "minSeq"
    FROM "ProcessStep"
    GROUP BY "scopeItemId", "solutionProcessName", "solutionProcessFlowName", "activityTitle"
    ORDER BY "scopeItemId", MIN("sequence")
  `;

  let actCreated = 0;
  let actSkipped = 0;

  for (const row of distinctActivities) {
    const processName = row.solutionProcessName ?? "__main_process__";
    const flowName = row.solutionProcessFlowName ?? "__main_flow__";
    const title = row.activityTitle ?? "__main_activity__";
    const pfId = pfMap.get(`${row.scopeItemId}::${processName}::${flowName}`);
    if (!pfId) {
      actSkipped++;
      continue;
    }

    try {
      await prisma.activity.upsert({
        where: {
          processFlowId_title: {
            processFlowId: pfId,
            title,
          },
        },
        create: {
          processFlowId: pfId,
          title,
          guid: row.activityGuid,
          targetName: row.activityTargetName,
          targetUrl: row.activityTargetUrl,
          sequence: row.minSeq,
        },
        update: {},
      });
      actCreated++;
    } catch {
      actSkipped++;
    }
  }

  console.log(`  Activity: ${actCreated} upserted, ${actSkipped} skipped`);

  // -----------------------------------------------------------------------
  // Pass 4: Backfill ProcessStep.activityId
  // -----------------------------------------------------------------------
  console.log("--- Pass 4: Backfilling ProcessStep.activityId ---");

  // Build full lookup: "scopeItemId::processName::flowName::activityTitle" → activityId
  const allActivities = await prisma.activity.findMany({
    select: { id: true, processFlowId: true, title: true },
  });
  const pfIdToKey = new Map<string, string>();
  for (const pf of allProcessFlows) {
    const sp = spIdToScopeProcess.get(pf.solutionProcessId);
    if (sp) {
      pfIdToKey.set(pf.id, `${sp.scopeItemId}::${sp.name}::${pf.name}`);
    }
  }
  const actMap = new Map<string, string>();
  for (const act of allActivities) {
    const pfKey = pfIdToKey.get(act.processFlowId);
    if (pfKey) {
      actMap.set(`${pfKey}::${act.title}`, act.id);
    }
  }

  // Process steps in batches using raw SQL for performance
  const orphansBefore = await prisma.processStep.count({ where: { activityId: null } });
  console.log(`  Steps without activityId: ${orphansBefore}`);

  let backfilled = 0;
  let cursor: string | undefined;

  while (true) {
    const steps = await prisma.processStep.findMany({
      where: { activityId: null },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        scopeItemId: true,
        solutionProcessName: true,
        solutionProcessFlowName: true,
        activityTitle: true,
      },
    });

    if (steps.length === 0) break;

    const updates = [];
    for (const step of steps) {
      const processName = step.solutionProcessName ?? "__main_process__";
      const flowName = step.solutionProcessFlowName ?? "__main_flow__";
      const title = step.activityTitle ?? "__main_activity__";
      const activityId = actMap.get(`${step.scopeItemId}::${processName}::${flowName}::${title}`);
      if (activityId) {
        updates.push(
          prisma.processStep.update({
            where: { id: step.id },
            data: { activityId },
          }),
        );
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
      backfilled += updates.length;
    }

    cursor = steps[steps.length - 1]?.id;
    if (steps.length < BATCH_SIZE) break;

    if (backfilled % 5000 === 0 && backfilled > 0) {
      console.log(`  Backfilled ${backfilled} steps...`);
    }
  }

  console.log(`  ProcessStep.activityId backfilled: ${backfilled}`);

  // -----------------------------------------------------------------------
  // Pass 5: Backfill ProcessFlowDiagram.processFlowId
  // -----------------------------------------------------------------------
  console.log("--- Pass 5: Backfilling ProcessFlowDiagram.processFlowId ---");

  // Build lookup from "scopeItemId::flowName" → processFlowId
  // ProcessFlowDiagram uses processFlowName which maps to solutionProcessFlowName
  const pfByFlowName = new Map<string, string>();
  for (const pf of allProcessFlows) {
    const sp = spIdToScopeProcess.get(pf.solutionProcessId);
    if (sp) {
      // A scope item may have multiple process flows with same name under different processes;
      // use first match (diagrams don't distinguish by process)
      const key = `${sp.scopeItemId}::${pf.name}`;
      if (!pfByFlowName.has(key)) {
        pfByFlowName.set(key, pf.id);
      }
    }
  }

  const diagrams = await prisma.processFlowDiagram.findMany({
    where: { processFlowId: null },
    select: { id: true, scopeItemId: true, processFlowName: true },
  });

  let diagramsBackfilled = 0;
  const diagramUpdates = [];
  for (const d of diagrams) {
    const pfId = pfByFlowName.get(`${d.scopeItemId}::${d.processFlowName}`);
    if (pfId) {
      diagramUpdates.push(
        prisma.processFlowDiagram.update({
          where: { id: d.id },
          data: { processFlowId: pfId },
        }),
      );
      diagramsBackfilled++;
    }
  }

  if (diagramUpdates.length > 0) {
    // Process in batches to avoid transaction limits
    for (let i = 0; i < diagramUpdates.length; i += BATCH_SIZE) {
      await prisma.$transaction(diagramUpdates.slice(i, i + BATCH_SIZE));
    }
  }

  console.log(`  ProcessFlowDiagram.processFlowId backfilled: ${diagramsBackfilled}`);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const spCount = await prisma.solutionProcess.count();
  const pfCount = await prisma.processFlow.count();
  const actCount = await prisma.activity.count();
  const orphansAfter = await prisma.processStep.count({ where: { activityId: null } });
  const totalSteps = await prisma.processStep.count();

  console.log("\n=== Extraction Summary ===");
  console.log(`  SolutionProcess: ${spCount}`);
  console.log(`  ProcessFlow: ${pfCount}`);
  console.log(`  Activity: ${actCount}`);
  console.log(`  ProcessStep total: ${totalSteps}`);
  console.log(`  ProcessStep orphans (no activityId): ${orphansAfter}`);
  console.log(`  ProcessFlowDiagram backfilled: ${diagramsBackfilled}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Extraction failed:", err);
  process.exit(1);
});
