/**
 * ABeam Workbench — Presales redaction layer unit tests.
 *
 * These tests run against the pure redaction functions; they do not touch
 * the database or the HTTP layer. They catch redaction regressions at the
 * function boundary. The integration test in
 * tests/integration/presales/external-redaction.spec.ts covers the
 * end-to-end hydration-JSON walker against a live HTTP response.
 *
 * If you add a redacted field, update both REDACTED_KEYS and the matching
 * test below. Mismatch is the single fastest way to introduce an IP leak.
 */

import { describe, expect, it } from 'vitest';
import type { Decision, ScopeItemContent } from '@/lib/fts/types';
import type { PresalesBundleDecision } from '@prisma/client';
import {
  REDACTED_KEYS,
  redactDecision,
  redactPresalesDecisionRow,
  redactScopeItem,
} from '@/lib/presales/redaction';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FIXTURE_DECISION: Decision = {
  id: 'd1',
  title: 'Sales document type strategy',
  summary: 'Choose between SAP standard, configure, or custom development.',
  sscui: '102495 — Configure Sales Document Types',
  sscui_id: '102495',
  sscui_name: 'Configure Sales Document Types',
  std_desc: 'Use OR/RE/AA out of the box.',
  cfg_desc: 'Configure via SSCUI; no code.',
  cst_desc: 'Custom document type with Key User Extensibility.',
  // ↓ All four of these are IP-bearing and must not survive redaction.
  effort: 5,
  custom_type: 'Key User Extensibility + Custom Sales Doc Type',
  ext_impact: 'Medium — custom fields need regression test each release',
  ricefw_class: 'E (Enhancement)',
};

const FIXTURE_SSCUI_REFS = [
  { sscui_id: '102495', name: 'Configure Sales Document Types', category: 'Sales', subarea: 'OTC' },
  { sscui_id: '101762', name: 'Number Ranges for Sales Documents', category: 'Sales', subarea: 'OTC' },
];

const FIXTURE_SCOPE: ScopeItemContent = {
  code: 'BD9',
  title: 'Sales Order Processing',
  overview: 'Standard sell-from-stock for finished goods.',
  business_roles: [{ name: 'Internal Sales Representative', id: 'SAP_BR_INTERNAL_SALES_REP' }],
  fiori_apps: ['Manage Sales Orders (F1873)'],
  process_steps: [
    { name: 'Create Sales Order', role: 'Internal Sales Rep', app: 'F1873', expected: 'Order created.' },
  ],
  master_data: [{ data: 'Material', sample: 'TG11', details: 'Finished good.' }],
  succeeding_processes: [{ raw: 'J60 – Accounts Receivable', description: 'Customer invoicing.' }],
  decisions: [FIXTURE_DECISION, { ...FIXTURE_DECISION, id: 'd2', effort: 8 }],
  sscui_refs: FIXTURE_SSCUI_REFS, // ← envelope-level IP-bearing payload
  release: 'S/4HANA Cloud Public Edition 2602 — MY',
};

const FIXTURE_DECISION_ROW: PresalesBundleDecision = {
  id: 'cltest',
  bundleId: 'bundle1',
  scopeCode: 'BD9',
  decisionId: 'd1',
  choice: 'cst',
  notes: 'Stakeholder wants custom doc type.',
  effortDays: 5, // ← INTERNAL
  setByGrantId: 'grant1',
  setAt: new Date('2026-05-20T10:00:00Z'),
  supersededAt: null,
};

// ─── Recursive key walker ───────────────────────────────────────────────────

function walkForKeys(value: unknown, found: Set<string>, depth = 0): void {
  if (depth > 50) return; // defense against cycles
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) walkForKeys(v, found, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    found.add(k);
    walkForKeys(v, found, depth + 1);
  }
}

function collectKeysAtAnyDepth(value: unknown): Set<string> {
  const found = new Set<string>();
  walkForKeys(value, found);
  return found;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('redactDecision', () => {
  it('strips all four IP-bearing decision fields', () => {
    const out = redactDecision(FIXTURE_DECISION);
    expect(out).not.toHaveProperty('effort');
    expect(out).not.toHaveProperty('custom_type');
    expect(out).not.toHaveProperty('ext_impact');
    expect(out).not.toHaveProperty('ricefw_class');
  });

  it('preserves client-visible decision fields', () => {
    const out = redactDecision(FIXTURE_DECISION);
    expect(out.id).toBe('d1');
    expect(out.title).toBe(FIXTURE_DECISION.title);
    expect(out.summary).toBe(FIXTURE_DECISION.summary);
    expect(out.std_desc).toBe(FIXTURE_DECISION.std_desc);
    expect(out.cfg_desc).toBe(FIXTURE_DECISION.cfg_desc);
    expect(out.cst_desc).toBe(FIXTURE_DECISION.cst_desc);
    expect(out.sscui).toBe(FIXTURE_DECISION.sscui);
    expect(out.sscui_id).toBe(FIXTURE_DECISION.sscui_id);
    expect(out.sscui_name).toBe(FIXTURE_DECISION.sscui_name);
  });
});

describe('redactScopeItem', () => {
  it('strips sscui_refs from the envelope', () => {
    const out = redactScopeItem(FIXTURE_SCOPE);
    expect(out).not.toHaveProperty('sscui_refs');
  });

  it('redacts every decision in the envelope', () => {
    const out = redactScopeItem(FIXTURE_SCOPE);
    expect(out.decisions).toHaveLength(2);
    for (const d of out.decisions) {
      expect(d).not.toHaveProperty('effort');
      expect(d).not.toHaveProperty('custom_type');
      expect(d).not.toHaveProperty('ext_impact');
      expect(d).not.toHaveProperty('ricefw_class');
    }
  });

  it('preserves client-visible envelope fields', () => {
    const out = redactScopeItem(FIXTURE_SCOPE);
    expect(out.code).toBe('BD9');
    expect(out.title).toBe(FIXTURE_SCOPE.title);
    expect(out.overview).toBe(FIXTURE_SCOPE.overview);
    expect(out.business_roles).toEqual(FIXTURE_SCOPE.business_roles);
    expect(out.fiori_apps).toEqual(FIXTURE_SCOPE.fiori_apps);
    expect(out.process_steps).toEqual(FIXTURE_SCOPE.process_steps);
    expect(out.master_data).toEqual(FIXTURE_SCOPE.master_data);
    expect(out.succeeding_processes).toEqual(FIXTURE_SCOPE.succeeding_processes);
    expect(out.release).toBe(FIXTURE_SCOPE.release);
  });

  it('no redacted key appears at any depth in the output', () => {
    const out = redactScopeItem(FIXTURE_SCOPE);
    const keysFound = collectKeysAtAnyDepth(out);
    for (const banned of REDACTED_KEYS) {
      expect(keysFound.has(banned), `forbidden key surfaced: ${banned}`).toBe(false);
    }
  });
});

describe('redactPresalesDecisionRow', () => {
  it('strips effortDays from the decision row', () => {
    const out = redactPresalesDecisionRow(FIXTURE_DECISION_ROW);
    expect(out).not.toHaveProperty('effortDays');
  });

  it('preserves all other row fields', () => {
    const out = redactPresalesDecisionRow(FIXTURE_DECISION_ROW);
    expect(out.id).toBe(FIXTURE_DECISION_ROW.id);
    expect(out.bundleId).toBe(FIXTURE_DECISION_ROW.bundleId);
    expect(out.scopeCode).toBe(FIXTURE_DECISION_ROW.scopeCode);
    expect(out.decisionId).toBe(FIXTURE_DECISION_ROW.decisionId);
    expect(out.choice).toBe(FIXTURE_DECISION_ROW.choice);
    expect(out.notes).toBe(FIXTURE_DECISION_ROW.notes);
  });

  it('no redacted key appears at any depth in the output', () => {
    const out = redactPresalesDecisionRow(FIXTURE_DECISION_ROW);
    const keysFound = collectKeysAtAnyDepth(out);
    for (const banned of REDACTED_KEYS) {
      expect(keysFound.has(banned), `forbidden key surfaced: ${banned}`).toBe(false);
    }
  });
});

describe('REDACTED_KEYS contract', () => {
  it('contains every key the redaction functions actually strip (no silent drift)', () => {
    // If REDACTED_KEYS drifts from the actual redaction surface, the
    // integration test stops being trustworthy. Pin the list here.
    expect([...REDACTED_KEYS].sort()).toEqual(
      ['effort', 'effortDays', 'custom_type', 'ext_impact', 'ricefw_class', 'sscui_refs'].sort(),
    );
  });
});
