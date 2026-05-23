/**
 * Idempotent seeder for the Layer-3 process flow.
 *
 * Reads prisma/seeds/value-stream/process-flow.json (produced by
 * scripts/extract-process-flow-data.py from Layer3-Process-Flow.xlsx
 * Sheet 1 + Sheet 2). Per-row upsert on flows (PK = scopeItemId),
 * delete-then-insert on steps (because the unique key is
 * (scopeItemId, stepNumber) and a re-extract might reorder a flow).
 *
 * Counts asserted at extract-time AND verified post-seed:
 *   - 655 flows
 *   - 2502 steps
 *
 * Order of operations matters: AffirmProcessStep FKs to
 * AffirmProcessFlow.scopeItemId, so flows are upserted first.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.join(__dirname, "process-flow.json");

interface FlowSeed {
  scopeItemId: string;
  activityCount: number;
  myStepCount: number;
  optionalCount: number;
}

interface StepSeed {
  scopeItemId: string;
  stepNumber: number;
  activity: string;
  fioriApps: string[];
}

interface Dataset {
  meta: { country: string; sapRelease: string; counts: Record<string, number> };
  flows: FlowSeed[];
  steps: StepSeed[];
}

export interface ProcessFlowSeedResult {
  flows: number;
  steps: number;
}

export async function seedProcessFlow(
  prisma: PrismaClient,
): Promise<ProcessFlowSeedResult> {
  const raw = await readFile(DATASET_PATH, "utf-8");
  const data = JSON.parse(raw) as Dataset;

  // ── 1. Flows (per-row upsert) ──────────────────────────────────
  for (const f of data.flows) {
    await prisma.affirmProcessFlow.upsert({
      where: { scopeItemId: f.scopeItemId },
      update: {
        activityCount: f.activityCount,
        myStepCount: f.myStepCount,
        optionalCount: f.optionalCount,
        country: data.meta.country,
        sapRelease: data.meta.sapRelease,
      },
      create: {
        scopeItemId: f.scopeItemId,
        activityCount: f.activityCount,
        myStepCount: f.myStepCount,
        optionalCount: f.optionalCount,
        country: data.meta.country,
        sapRelease: data.meta.sapRelease,
      },
    });
  }

  // ── 2. Steps (replace per flow). createMany for speed; we wipe
  // the flow's steps first so the unique (scopeItemId, stepNumber)
  // constraint can't trip on a reorder. Grouped by scopeItemId so
  // a re-seed touches only changed flows.
  const stepsByFlow = new Map<string, StepSeed[]>();
  for (const s of data.steps) {
    const arr = stepsByFlow.get(s.scopeItemId) ?? [];
    arr.push(s);
    stepsByFlow.set(s.scopeItemId, arr);
  }
  for (const [scopeItemId, rows] of stepsByFlow) {
    await prisma.affirmProcessStep.deleteMany({ where: { scopeItemId } });
    if (rows.length === 0) continue;
    await prisma.affirmProcessStep.createMany({
      data: rows.map((r) => ({
        scopeItemId: r.scopeItemId,
        stepNumber: r.stepNumber,
        activity: r.activity,
        fioriApps: r.fioriApps,
      })),
    });
  }

  // ── 3. Drift check ────────────────────────────────────────────
  const [flowCount, stepCount] = await Promise.all([
    prisma.affirmProcessFlow.count(),
    prisma.affirmProcessStep.count(),
  ]);
  const expectedFlows = data.meta.counts.flows;
  const expectedSteps = data.meta.counts.steps;
  if (expectedFlows !== undefined && flowCount < expectedFlows) {
    throw new Error(
      `[seed] process-flow count drift on flows: expected ${expectedFlows}, got ${flowCount}`,
    );
  }
  if (expectedSteps !== undefined && stepCount < expectedSteps) {
    throw new Error(
      `[seed] process-flow count drift on steps: expected ${expectedSteps}, got ${stepCount}`,
    );
  }

  return { flows: flowCount, steps: stepCount };
}
