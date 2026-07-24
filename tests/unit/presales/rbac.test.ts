/**
 * RBAC matrix sanity tests.
 *
 * Catches the "I added a role but forgot to add it to the entry gate"
 * regression and the "I gave project_manager write permissions" regression.
 */

import { describe, expect, it } from 'vitest';
import {
  canAccessPresales,
  canPerformPresalesAction,
  isReadOnlyRole,
  lacksTenantScope,
} from '@/lib/presales/rbac';

describe('canAccessPresales', () => {
  it.each([
    'consultant',
    'partner_lead',
    'platform_admin',
    'executive_sponsor',
    'project_manager',
  ] as const)('allows %s', (role) => {
    expect(canAccessPresales(role)).toBe(true);
  });

  it.each(['process_owner', 'it_lead', 'viewer', null, undefined, 'unknown'])(
    'rejects %s',
    (role) => {
      expect(canAccessPresales(role)).toBe(false);
    },
  );
});

describe('canPerformPresalesAction — write actions', () => {
  for (const action of [
    'create_bundle',
    'send_bundle',
    'revoke_bundle',
    'extend_bundle',
    'edit_bundle_draft',
    'submit_change_request',
  ] as const) {
    it(`allows consultant ${action}`, () => {
      expect(canPerformPresalesAction('consultant', action)).toBe(true);
    });
    it(`allows partner_lead ${action}`, () => {
      expect(canPerformPresalesAction('partner_lead', action)).toBe(true);
    });
    it(`rejects project_manager ${action}`, () => {
      expect(canPerformPresalesAction('project_manager', action)).toBe(false);
    });
    it(`rejects executive_sponsor ${action}`, () => {
      expect(canPerformPresalesAction('executive_sponsor', action)).toBe(false);
    });
  }
});

describe('canPerformPresalesAction — view + preview', () => {
  for (const role of ['project_manager', 'executive_sponsor', 'consultant', 'partner_lead', 'platform_admin'] as const) {
    it(`${role} can view`, () => {
      expect(canPerformPresalesAction(role, 'view')).toBe(true);
    });
    it(`${role} can preview_as_client`, () => {
      expect(canPerformPresalesAction(role, 'preview_as_client')).toBe(true);
    });
  }
});

describe('canPerformPresalesAction — admin gate', () => {
  it('only platform_admin can admin_hard_delete', () => {
    expect(canPerformPresalesAction('platform_admin', 'admin_hard_delete')).toBe(true);
    expect(canPerformPresalesAction('consultant', 'admin_hard_delete')).toBe(false);
    expect(canPerformPresalesAction('partner_lead', 'admin_hard_delete')).toBe(false);
  });
});

describe('isReadOnlyRole', () => {
  it('flags executive_sponsor + project_manager as read-only', () => {
    expect(isReadOnlyRole('executive_sponsor')).toBe(true);
    expect(isReadOnlyRole('project_manager')).toBe(true);
    expect(isReadOnlyRole('consultant')).toBe(false);
    expect(isReadOnlyRole('platform_admin')).toBe(false);
  });
});

describe('lacksTenantScope', () => {
  it('blocks a non-admin user with no organization (the cross-org scope drop that was fixed)', () => {
    expect(lacksTenantScope({ organizationId: null, role: 'consultant' })).toBe(true);
  });

  it('allows a non-admin user who belongs to an organization', () => {
    expect(lacksTenantScope({ organizationId: 'org_1', role: 'consultant' })).toBe(false);
  });

  it('allows a platform_admin even with a null organization (global access)', () => {
    expect(lacksTenantScope({ organizationId: null, role: 'platform_admin' })).toBe(false);
  });
});
