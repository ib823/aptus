/**
 * ABeam Workbench — Neutral Process Discovery client serializers (THE LEAK BOUNDARY).
 *
 * Every object that reaches a /d/* page, route, or export pack passes through an
 * explicit allowlist mapper here. Mirrors the Affirm external serializer
 * pattern: fields are copied field-by-field, never spread, so a new field
 * appearing upstream cannot ride along silently.
 *
 * Two properties this file exists to hold:
 *   1. Product-agnostic wall — the client dataset is vendor-term free, and these
 *      mappers only ever read from it. Belt and braces with the CI grep.
 *   2. Two-lane export (PR-6) — the client pack reuses these mappers, so it
 *      CANNOT contain the product map or internal notes. True by construction,
 *      not by review.
 *
 * Consultant-only fields (origin, apqc, provenance, parked enablers) have no
 * mapper here on purpose. There is no toClientX() that accepts a
 * ConsultantProcess — that is a compile-time wall, not a convention.
 */

import { laneForRole } from "./client-library";
import type { ClientProcess, ClientValueStream, Completeness, FlowStep, SubStep, Tier } from "./schema";

// ─── Output shapes (what a /d/* surface is allowed to see) ───────────────────

export interface DiscoverySubStep {
  title: string;
  lane: string;
  optional: boolean;
}

export interface DiscoveryFlowStep {
  step: string;
  lane: string;
  optional: boolean;
  substeps: DiscoverySubStep[];
}

export interface DiscoveryProcess {
  id: string;
  name: string;
  description: string;
  tier: Tier;
  industry: string | null;
  /** null ⇒ render the "no step flow catalogued" fallback, never a guess. */
  completeness: Completeness | null;
  hasFlow: boolean;
  flow: DiscoveryFlowStep[];
}

export interface DiscoveryWorkflowSummary {
  name: string;
  processCount: number;
}

export interface DiscoveryValueStream {
  id: string;
  name: string;
  domain: string;
  alias: string;
  processCount: number;
  workflowCount: number;
  workflows: DiscoveryWorkflowSummary[];
}

// ─── Allowlist mappers ───────────────────────────────────────────────────────

export function toDiscoverySubStep(s: SubStep): DiscoverySubStep {
  return {
    title: s.t,
    lane: laneForRole(s.r),
    optional: s.o,
  };
}

export function toDiscoveryFlowStep(s: FlowStep): DiscoveryFlowStep {
  return {
    step: s.step,
    lane: laneForRole(s.role),
    optional: s.optional ?? false,
    substeps: (s.substeps ?? []).map(toDiscoverySubStep),
  };
}

export function toDiscoveryProcess(p: ClientProcess): DiscoveryProcess {
  const flow = p.flow ?? [];
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    tier: p.tier,
    industry: p.industry,
    completeness: p.completeness,
    hasFlow: flow.length > 0,
    flow: flow.map(toDiscoveryFlowStep),
  };
}

export function toDiscoveryValueStream(vs: ClientValueStream): DiscoveryValueStream {
  return {
    id: vs.id,
    name: vs.name,
    domain: vs.domain,
    alias: vs.alias,
    processCount: vs.process_count,
    workflowCount: vs.workflow_count,
    workflows: vs.workflows.map((wf) => ({
      name: wf.name,
      processCount: wf.processes.length,
    })),
  };
}
