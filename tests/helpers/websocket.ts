/**
 * WebSocket mock utilities for testing real-time collaboration features.
 */

export interface MockWebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  senderId?: string;
}

export interface MockWebSocketClient {
  id: string;
  userId: string;
  assessmentId: string;
  connected: boolean;
  messages: MockWebSocketMessage[];
  send: (msg: MockWebSocketMessage) => void;
  close: () => void;
  onMessage: ((msg: MockWebSocketMessage) => void) | null;
}

let clientCounter = 0;

/** Create a mock WebSocket client */
export function createMockWebSocketClient(
  userId: string,
  assessmentId: string
): MockWebSocketClient {
  const client: MockWebSocketClient = {
    id: `ws-client-${++clientCounter}`,
    userId,
    assessmentId,
    connected: true,
    messages: [],
    send(msg) {
      if (!this.connected) throw new Error("WebSocket is closed");
      this.messages.push(msg);
    },
    close() {
      this.connected = false;
    },
    onMessage: null,
  };
  return client;
}

/** Create a mock presence update message */
export function createPresenceMessage(
  userId: string,
  status: "ONLINE" | "IDLE" | "OFFLINE",
  currentPage?: string
): MockWebSocketMessage {
  return {
    type: "presence:update",
    payload: { userId, status, currentPage },
    timestamp: Date.now(),
    senderId: userId,
  };
}

/** Create a mock lock acquire message */
export function createLockMessage(
  userId: string,
  entityType: string,
  entityId: string,
  action: "acquire" | "release"
): MockWebSocketMessage {
  return {
    type: `lock:${action}`,
    payload: { userId, entityType, entityId },
    timestamp: Date.now(),
    senderId: userId,
  };
}

/** Create a mock activity feed message */
export function createActivityMessage(
  actorId: string,
  actionType: string,
  summary: string
): MockWebSocketMessage {
  return {
    type: "activity:new",
    payload: { actorId, actionType, summary },
    timestamp: Date.now(),
    senderId: actorId,
  };
}

/** Simulate multiple concurrent WebSocket clients */
export function createConcurrentClients(
  count: number,
  assessmentId: string
): MockWebSocketClient[] {
  return Array.from({ length: count }, (_, i) =>
    createMockWebSocketClient(`user-${i + 1}`, assessmentId)
  );
}

/** WebSocket message types */
export const WS_MESSAGE_TYPES = {
  PRESENCE_UPDATE: "presence:update",
  LOCK_ACQUIRE: "lock:acquire",
  LOCK_RELEASE: "lock:release",
  LOCK_EXPIRED: "lock:expired",
  COMMENT_NEW: "comment:new",
  COMMENT_EDIT: "comment:edit",
  COMMENT_DELETE: "comment:delete",
  CONFLICT_DETECTED: "conflict:detected",
  CONFLICT_RESOLVED: "conflict:resolved",
  ACTIVITY_NEW: "activity:new",
  STEP_CLASSIFIED: "step:classified",
  NOTIFICATION: "notification",
} as const;
