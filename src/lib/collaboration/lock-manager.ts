import { prisma } from "@/lib/db/prisma";

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export interface LockInfo {
  id: string;
  assessmentId: string;
  entityType: string;
  entityId: string;
  lockedById: string;
  lockedByName: string;
  acquiredAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

/**
 * Acquire an editing lock on an entity.
 * Returns the lock if acquired, or null if another user holds it.
 */
export async function acquireLock(params: {
  assessmentId: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
}): Promise<{ lock: LockInfo | null; heldBy: LockInfo | null }> {
  const { assessmentId, entityType, entityId, userId, userName } = params;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

  // Clean up expired lock on this entity first
  await prisma.editingLock.updateMany({
    where: {
      assessmentId,
      entityType,
      entityId,
      isActive: true,
      expiresAt: { lt: now },
    },
    data: { isActive: false },
  });

  // Try to upsert — if no active lock exists or we already hold it
  try {
    const lock = await prisma.editingLock.upsert({
      where: {
        assessmentId_entityType_entityId: { assessmentId, entityType, entityId },
      },
      update: {
        // Only update if the lock is expired/inactive or held by same user
        lockedById: userId,
        lockedByName: userName,
        acquiredAt: now,
        expiresAt,
        isActive: true,
      },
      create: {
        assessmentId,
        entityType,
        entityId,
        lockedById: userId,
        lockedByName: userName,
        acquiredAt: now,
        expiresAt,
        isActive: true,
      },
    });

    // If someone else holds an active, non-expired lock, the upsert
    // would overwrite — so we need a check-and-set approach
    if (lock.lockedById !== userId) {
      // Check if the existing lock is still valid
      if (lock.isActive && lock.expiresAt > now) {
        return { lock: null, heldBy: lock };
      }
    }

    return { lock, heldBy: null };
  } catch {
    // Race condition — another user grabbed it
    const existing = await prisma.editingLock.findUnique({
      where: {
        assessmentId_entityType_entityId: { assessmentId, entityType, entityId },
      },
    });

    if (existing && existing.isActive && existing.expiresAt > now && existing.lockedById !== userId) {
      return { lock: null, heldBy: existing };
    }

    // Expired or inactive — retry once
    const lock = await prisma.editingLock.upsert({
      where: {
        assessmentId_entityType_entityId: { assessmentId, entityType, entityId },
      },
      update: {
        lockedById: userId,
        lockedByName: userName,
        acquiredAt: now,
        expiresAt,
        isActive: true,
      },
      create: {
        assessmentId,
        entityType,
        entityId,
        lockedById: userId,
        lockedByName: userName,
        acquiredAt: now,
        expiresAt,
        isActive: true,
      },
    });

    return { lock, heldBy: null };
  }
}

/**
 * Release a lock held by a specific user.
 */
export async function releaseLock(params: {
  assessmentId: string;
  entityType: string;
  entityId: string;
  userId: string;
}): Promise<boolean> {
  const { assessmentId, entityType, entityId, userId } = params;

  const result = await prisma.editingLock.updateMany({
    where: {
      assessmentId,
      entityType,
      entityId,
      lockedById: userId,
      isActive: true,
    },
    data: { isActive: false },
  });

  return result.count > 0;
}

/**
 * Refresh (extend) a lock's expiry.
 */
export async function refreshLock(params: {
  assessmentId: string;
  entityType: string;
  entityId: string;
  userId: string;
}): Promise<boolean> {
  const { assessmentId, entityType, entityId, userId } = params;
  const expiresAt = new Date(Date.now() + LOCK_DURATION_MS);

  const result = await prisma.editingLock.updateMany({
    where: {
      assessmentId,
      entityType,
      entityId,
      lockedById: userId,
      isActive: true,
    },
    data: { expiresAt },
  });

  return result.count > 0;
}

/**
 * Get all active (non-expired) locks for an assessment.
 */
export async function getActiveLocks(assessmentId: string): Promise<LockInfo[]> {
  return prisma.editingLock.findMany({
    where: {
      assessmentId,
      isActive: true,
      expiresAt: { gt: new Date() },
    },
    orderBy: { acquiredAt: "desc" },
  });
}

/**
 * Clean up all expired locks globally.
 * Can be called periodically by a cron job.
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const result = await prisma.editingLock.updateMany({
    where: {
      isActive: true,
      expiresAt: { lt: new Date() },
    },
    data: { isActive: false },
  });

  return result.count;
}
