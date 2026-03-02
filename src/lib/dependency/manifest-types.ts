/**
 * Dependency Manifest — Type definitions for version-resilient dependency registration.
 *
 * Dependencies are declared in a JSON manifest using SAP-stable identifiers
 * (GUIDs + activity titles), not database UUIDs. The manifest is version-controlled,
 * diffable, and serves as the single source of truth.
 */

import type { DependencyType, PropagationRule, FlowDirection } from "@prisma/client";

// ---------------------------------------------------------------------------
// Activity reference — stable across SAP versions
// ---------------------------------------------------------------------------

export interface ActivityRef {
  guid: string | null;         // SAP GUID (most stable across versions)
  title: string;               // Activity title (fallback)
  processFlowName: string | null; // Disambiguation when titles repeat
}

// ---------------------------------------------------------------------------
// Derivation provenance
// ---------------------------------------------------------------------------

export type DerivationSignal =
  | "PROCESS_FLOW_ORDERING"
  | "MULTI_SCOPE_CONFIG"
  | "SHARED_APP_AREA"
  | "PREREQUISITES_TEXT";

export interface DerivationSource {
  signal: DerivationSignal;
  detail: string;              // Human-readable provenance (e.g., "ProcessFlow: Invoice Processing, seq 3→4")
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

// ---------------------------------------------------------------------------
// Within-scope rule
// ---------------------------------------------------------------------------

export interface WithinScopeRule {
  scopeItemCode: string;
  source: ActivityRef;
  target: ActivityRef;
  dependencyType: DependencyType;
  propagationRule: PropagationRule;
  businessReason: string;
  confidence: Confidence;
  derivedFrom: DerivationSource;
}

// ---------------------------------------------------------------------------
// Cross-scope rule
// ---------------------------------------------------------------------------

export interface CrossScopeRule {
  sourceScopeCode: string;
  targetScopeCode: string;
  source: ActivityRef;
  target: ActivityRef;
  direction: FlowDirection;
  businessReason: string;
  confidence: Confidence;
  derivedFrom: DerivationSource;
}

// ---------------------------------------------------------------------------
// Full manifest
// ---------------------------------------------------------------------------

export interface DependencyManifest {
  version: string;                       // "2508"
  generatedAt: string;                   // ISO timestamp
  contentHash: string;                   // SHA-256 of sorted body (computed after generation)
  withinScope: WithinScopeRule[];
  crossScope: CrossScopeRule[];
  metadata: {
    totalScopeItems: number;
    derivationSignals: DerivationSignal[];
  };
}

// ---------------------------------------------------------------------------
// Diff report
// ---------------------------------------------------------------------------

export interface ManifestDiffEntry {
  type: "added" | "removed" | "changed";
  key: string;                           // Stable key: "scopeCode:guid" or "scopeCode:title"
  oldRule?: WithinScopeRule | CrossScopeRule;
  newRule?: WithinScopeRule | CrossScopeRule;
  changes?: string[];                    // List of changed fields
}

export interface ManifestDiffReport {
  oldVersion: string;
  newVersion: string;
  generatedAt: string;
  added: ManifestDiffEntry[];
  removed: ManifestDiffEntry[];
  changed: ManifestDiffEntry[];
  unchangedCount: number;
}

// ---------------------------------------------------------------------------
// Resolution result (for manifest-loader)
// ---------------------------------------------------------------------------

export interface ResolutionResult {
  activityRef: ActivityRef;
  resolvedId: string | null;
  resolvedBy: "guid" | "exact_title" | "title_flow" | "fuzzy" | "unresolved";
  warning?: string;
}
