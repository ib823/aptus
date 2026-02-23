/** Shared register utilities for Integration, Data Migration, and OCM registers */

import { getCapabilities } from "@/lib/auth/role-permissions";
import { ERROR_CODES } from "@/types/api";

export type RegisterType = "integration" | "data_migration" | "ocm";

export interface RegisterPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

/**
 * Get register permissions based on a user's role.
 * Uses the existing ROLE_CAPABILITIES matrix.
 */
export function getRegisterPermissions(userRole: string): RegisterPermissions {
  const caps = getCapabilities(userRole);
  return {
    canView: true, // all authenticated users can view registers
    canCreate: caps.canEditRegisters,
    canEdit: caps.canEditRegisters,
    canDelete: caps.canEditRegisters,
    canApprove: caps.canApproveGaps || caps.canSignOff,
  };
}

/**
 * Assert that an assessment is not locked (signed_off status).
 * Throws a structured error object suitable for NextResponse.json().
 */
export function assertAssessmentNotLocked(assessment: {
  status: string;
}): void {
  if (assessment.status === "signed_off") {
    throw new RegisterLockedError();
  }
}

/**
 * Assert that a user can manage (create/edit/delete) a register entry.
 * Throws a structured error object if the user lacks permission.
 */
export function assertCanManageRegister(userRole: string): void {
  const perms = getRegisterPermissions(userRole);
  if (!perms.canEdit) {
    throw new RegisterPermissionError();
  }
}

/**
 * Parse and compare updatedAt for optimistic locking.
 * Throws 409 if the record has been modified since the client last fetched it.
 */
export function parseOptimisticLock(
  bodyUpdatedAt: string | undefined | null,
  existingUpdatedAt: Date,
): void {
  if (!bodyUpdatedAt) return; // skip check if client doesn't send updatedAt
  const clientDate = new Date(bodyUpdatedAt);
  if (clientDate.getTime() !== existingUpdatedAt.getTime()) {
    throw new OptimisticLockError();
  }
}

// --- Error classes ---

export class RegisterLockedError extends Error {
  readonly statusCode = 403;
  readonly errorCode = ERROR_CODES.FORBIDDEN;
  constructor() {
    super("Assessment is locked after sign-off");
    this.name = "RegisterLockedError";
  }
}

export class RegisterPermissionError extends Error {
  readonly statusCode = 403;
  readonly errorCode = ERROR_CODES.FORBIDDEN;
  constructor() {
    super("Insufficient permissions to manage register entries");
    this.name = "RegisterPermissionError";
  }
}

export class OptimisticLockError extends Error {
  readonly statusCode = 409;
  readonly errorCode = ERROR_CODES.CONFLICT;
  constructor() {
    super("Record has been modified by another user. Please refresh and try again.");
    this.name = "OptimisticLockError";
  }
}

/**
 * Handle register errors in API routes.
 * Returns { status, body } for use with NextResponse.json().
 */
export function handleRegisterError(err: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (
    err instanceof RegisterLockedError ||
    err instanceof RegisterPermissionError ||
    err instanceof OptimisticLockError
  ) {
    return {
      status: err.statusCode,
      body: { error: { code: err.errorCode, message: err.message } },
    };
  }
  throw err; // re-throw unexpected errors
}
