/**
 * ABeam Workbench — Neutral Process Discovery dataset schemas.
 *
 * Both datasets are committed, frozen, and hash-pinned (see BUILD-LOG.md).
 * These schemas validate them at load so a malformed or drifted dataset fails
 * loudly at boot rather than rendering wrong.
 *
 * D1 — the `meta` blocks are INFORMATIONAL ONLY and deliberately typed as
 * unknown. Consultant `meta.completeness` is known-stale (claims 155/177/306,
 * actual 223/177/326). MANIFEST.json is the sole authority for counts; nothing
 * in this codebase may read a count out of `meta`. Typing it as unknown makes
 * that a compile error rather than a convention.
 */

import { z } from "zod";

// ─── Shared leaves ───────────────────────────────────────────────────────────

/** A sub-step: t=title, r=role, o=optional. Terse keys are the dataset's own. */
export const SubStepSchema = z.object({
  t: z.string(),
  r: z.string(),
  o: z.boolean(),
});

/**
 * A flow step. `role` is empty for 1400 of 3035 steps — the brief (which wins
 * over the .dc) puts blank-role steps in a "System / Automatic" lane. Callers
 * must go through laneForRole() rather than rendering `role` raw.
 */
export const FlowStepSchema = z.object({
  step: z.string(),
  role: z.string(),
  optional: z.boolean().optional(),
  substeps: z.array(SubStepSchema).optional(),
});

export const TierSchema = z.enum(["core", "generalized"]);

/** Null for the 16 processes with no flow. */
export const CompletenessSchema = z.enum(["detailed", "detailed+variants", "outline"]);

// ─── Client dataset (the ONLY content source for /d/* surfaces) ──────────────

export const ClientProcessSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tier: TierSchema,
  industry: z.string().nullable(),
  completeness: CompletenessSchema.nullable(),
  flow: z.array(FlowStepSchema).optional(),
});

export const ClientWorkflowSchema = z.object({
  name: z.string(),
  processes: z.array(ClientProcessSchema),
});

export const ClientValueStreamSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  alias: z.string(),
  process_count: z.number(),
  workflow_count: z.number(),
  workflows: z.array(ClientWorkflowSchema),
});

export const ClientLibrarySchema = z.object({
  meta: z.unknown(), // D1: informational only. Never read a count from here.
  value_streams: z.array(ClientValueStreamSchema),
});

// ─── Consultant dataset (NEVER importable from (external) — see guards) ──────

export const ProvenanceSchema = z.object({
  source: z.string(),
  main_steps: z.number(),
  sub_steps: z.number(),
  total_activities: z.number(),
  optional_steps: z.number().optional(),
});

export const ApqcSchema = z.object({
  code: z.string(),
  category: z.string(),
});

/**
 * Note the join key: the consultant dataset keys processes by `scope_id`, the
 * client dataset by `id`. Same 742 values, different field name. D2 — the
 * consultant dataset carries no `completeness`; it is derived across this join.
 */
export const ConsultantProcessSchema = z.object({
  scope_id: z.string(),
  name: z.string(),
  description: z.string(),
  tier: TierSchema,
  industry: z.string().nullable(),
  origin: z.enum(["sap-base", "overlay"]),
  apqc: ApqcSchema.nullable().optional(),
  provenance: ProvenanceSchema.nullable().optional(),
  flow: z.array(FlowStepSchema).optional(),
});

export const ConsultantWorkflowSchema = z.object({
  name: z.string(),
  process_count: z.number().optional(),
  processes: z.array(ConsultantProcessSchema),
});

export const ConsultantValueStreamSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  alias: z.string(),
  process_count: z.number(),
  workflow_count: z.number(),
  workflows: z.array(ConsultantWorkflowSchema),
});

export const ConsultantLibrarySchema = z.object({
  meta: z.unknown(), // D1: informational only, and known-stale.
  parked: z.array(z.unknown()), // Parked vendor enablers — consultant-only by construction.
  value_streams: z.array(ConsultantValueStreamSchema),
});

// ─── MANIFEST (the sole authority for counts + integrity) ────────────────────

export const ManifestSchema = z.object({
  generated: z.string(),
  source: z.string(),
  counts: z.object({
    processes: z.number(),
    value_streams: z.number(),
    workflows: z.number(),
    with_flow: z.number(),
    with_substeps: z.number(),
    origin: z.object({ sap_base: z.number(), overlay: z.number() }),
    parked_sap_enablers: z.number(),
  }),
  files: z.record(z.string(), z.string()),
  client_dataset_vendor_leaks: z.number(),
});

export const VendorTermGuardSchema = z.object({
  description: z.string(),
  terms: z.array(z.string()),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type SubStep = z.infer<typeof SubStepSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type Completeness = z.infer<typeof CompletenessSchema>;
export type ClientProcess = z.infer<typeof ClientProcessSchema>;
export type ClientWorkflow = z.infer<typeof ClientWorkflowSchema>;
export type ClientValueStream = z.infer<typeof ClientValueStreamSchema>;
export type ClientLibrary = z.infer<typeof ClientLibrarySchema>;
export type ConsultantProcess = z.infer<typeof ConsultantProcessSchema>;
export type ConsultantValueStream = z.infer<typeof ConsultantValueStreamSchema>;
export type ConsultantLibrary = z.infer<typeof ConsultantLibrarySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type VendorTermGuard = z.infer<typeof VendorTermGuardSchema>;
