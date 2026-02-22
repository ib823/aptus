/**
 * STATUS: Self-contained specification test
 * REAL MODULE: src/app/api/ routes
 * WIRING BLOCKED BY: Need database layer
 *
 * Integration tests: Presence (T-PRES-001 through T-PRES-007)
 *
 * Validates real-time presence tracking within assessment collaboration
 * channels, including join, leave, idle detection, and cross-assessment
 * isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createMockWebSocketClient,
  createPresenceMessage,
  createConcurrentClients,
  WS_MESSAGE_TYPES,
  type MockWebSocketClient,
  type MockWebSocketMessage,
} from "../../helpers/websocket";

// ---------------------------------------------------------------------------
// Presence channel simulation
// ---------------------------------------------------------------------------

interface PresenceEntry {
  userId: string;
  status: "ONLINE" | "IDLE" | "OFFLINE";
  currentPage: string | undefined;
  lastSeenAt: number;
}

class PresenceChannel {
  private channels = new Map<string, Map<string, PresenceEntry>>();
  private clients = new Map<string, MockWebSocketClient[]>();

  join(assessmentId: string, client: MockWebSocketClient): PresenceEntry {
    if (!this.channels.has(assessmentId)) {
      this.channels.set(assessmentId, new Map());
    }
    if (!this.clients.has(assessmentId)) {
      this.clients.set(assessmentId, []);
    }

    const entry: PresenceEntry = {
      userId: client.userId,
      status: "ONLINE",
      currentPage: undefined,
      lastSeenAt: Date.now(),
    };

    this.channels.get(assessmentId)!.set(client.userId, entry);
    this.clients.get(assessmentId)!.push(client);

    // Broadcast join to other clients
    this.broadcast(assessmentId, createPresenceMessage(client.userId, "ONLINE"), client.userId);

    return entry;
  }

  leave(assessmentId: string, userId: string): void {
    const channel = this.channels.get(assessmentId);
    if (channel) {
      channel.delete(userId);
    }

    const clients = this.clients.get(assessmentId);
    if (clients) {
      const filtered = clients.filter((c) => c.userId !== userId);
      this.clients.set(assessmentId, filtered);
    }

    // Broadcast leave
    this.broadcast(assessmentId, createPresenceMessage(userId, "OFFLINE"));
  }

  updateStatus(
    assessmentId: string,
    userId: string,
    status: "ONLINE" | "IDLE" | "OFFLINE",
    currentPage?: string,
  ): PresenceEntry | null {
    const channel = this.channels.get(assessmentId);
    if (!channel) return null;
    const entry = channel.get(userId);
    if (!entry) return null;

    entry.status = status;
    entry.lastSeenAt = Date.now();
    if (currentPage !== undefined) entry.currentPage = currentPage;

    this.broadcast(assessmentId, createPresenceMessage(userId, status, currentPage), userId);
    return entry;
  }

  getOnlineUsers(assessmentId: string): PresenceEntry[] {
    const channel = this.channels.get(assessmentId);
    if (!channel) return [];
    return Array.from(channel.values()).filter((e) => e.status !== "OFFLINE");
  }

  getAllEntries(assessmentId: string): PresenceEntry[] {
    const channel = this.channels.get(assessmentId);
    if (!channel) return [];
    return Array.from(channel.values());
  }

  getChannelSize(assessmentId: string): number {
    return this.channels.get(assessmentId)?.size ?? 0;
  }

  private broadcast(
    assessmentId: string,
    msg: MockWebSocketMessage,
    excludeUserId?: string,
  ): void {
    const clients = this.clients.get(assessmentId) ?? [];
    for (const client of clients) {
      if (client.userId !== excludeUserId && client.connected) {
        client.send(msg);
      }
    }
  }

  clear(): void {
    this.channels.clear();
    this.clients.clear();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Presence (T-PRES)", () => {
  let presence: PresenceChannel;

  const assessmentA = "assess-presence-a";
  const assessmentB = "assess-presence-b";

  beforeEach(() => {
    presence = new PresenceChannel();
  });

  it("T-PRES-001: User joining assessment appears in presence channel", () => {
    const client = createMockWebSocketClient("user-1", assessmentA);
    const entry = presence.join(assessmentA, client);

    expect(entry.userId).toBe("user-1");
    expect(entry.status).toBe("ONLINE");

    const online = presence.getOnlineUsers(assessmentA);
    expect(online).toHaveLength(1);
    expect(online[0]!.userId).toBe("user-1");
  });

  it("T-PRES-002: Multiple users see each other in the same assessment channel", () => {
    const client1 = createMockWebSocketClient("user-1", assessmentA);
    const client2 = createMockWebSocketClient("user-2", assessmentA);
    const client3 = createMockWebSocketClient("user-3", assessmentA);

    presence.join(assessmentA, client1);
    presence.join(assessmentA, client2);
    presence.join(assessmentA, client3);

    const online = presence.getOnlineUsers(assessmentA);
    expect(online).toHaveLength(3);

    const userIds = online.map((e) => e.userId).sort();
    expect(userIds).toEqual(["user-1", "user-2", "user-3"]);

    // Client 1 should have received join messages for user-2 and user-3
    expect(client1.messages).toHaveLength(2);
    expect(client1.messages.every((m) => m.type === WS_MESSAGE_TYPES.PRESENCE_UPDATE)).toBe(true);
  });

  it("T-PRES-003: User leaving assessment is removed from presence channel", () => {
    const client1 = createMockWebSocketClient("user-1", assessmentA);
    const client2 = createMockWebSocketClient("user-2", assessmentA);

    presence.join(assessmentA, client1);
    presence.join(assessmentA, client2);

    expect(presence.getOnlineUsers(assessmentA)).toHaveLength(2);

    // User 1 leaves
    presence.leave(assessmentA, "user-1");

    const online = presence.getOnlineUsers(assessmentA);
    expect(online).toHaveLength(1);
    expect(online[0]!.userId).toBe("user-2");

    // Client 2 receives leave notification
    const leaveMessages = client2.messages.filter(
      (m) => m.payload.status === "OFFLINE" && m.payload.userId === "user-1",
    );
    expect(leaveMessages).toHaveLength(1);
  });

  it("T-PRES-004: Idle status is tracked and broadcast to other users", () => {
    const client1 = createMockWebSocketClient("user-1", assessmentA);
    const client2 = createMockWebSocketClient("user-2", assessmentA);

    presence.join(assessmentA, client1);
    presence.join(assessmentA, client2);

    // User 1 becomes idle
    const entry = presence.updateStatus(assessmentA, "user-1", "IDLE");
    expect(entry!.status).toBe("IDLE");

    // User 1 is still in online users (IDLE != OFFLINE)
    const online = presence.getOnlineUsers(assessmentA);
    expect(online).toHaveLength(2);
    expect(online.find((e) => e.userId === "user-1")!.status).toBe("IDLE");

    // Client 2 received the idle broadcast
    const idleMessages = client2.messages.filter(
      (m) => m.payload.status === "IDLE" && m.payload.userId === "user-1",
    );
    expect(idleMessages).toHaveLength(1);
  });

  it("T-PRES-005: Current page navigation is tracked in presence", () => {
    const client1 = createMockWebSocketClient("user-1", assessmentA);
    presence.join(assessmentA, client1);

    // User navigates to different pages
    presence.updateStatus(assessmentA, "user-1", "ONLINE", "/scope");
    let entry = presence.getAllEntries(assessmentA).find((e) => e.userId === "user-1")!;
    expect(entry.currentPage).toBe("/scope");

    presence.updateStatus(assessmentA, "user-1", "ONLINE", "/gaps/J60");
    entry = presence.getAllEntries(assessmentA).find((e) => e.userId === "user-1")!;
    expect(entry.currentPage).toBe("/gaps/J60");

    presence.updateStatus(assessmentA, "user-1", "ONLINE", "/integration-register");
    entry = presence.getAllEntries(assessmentA).find((e) => e.userId === "user-1")!;
    expect(entry.currentPage).toBe("/integration-register");
  });

  it("T-PRES-006: Presence channel is scoped per assessment -- no cross-bleed", () => {
    const clientA = createMockWebSocketClient("user-1", assessmentA);
    const clientB = createMockWebSocketClient("user-2", assessmentB);

    presence.join(assessmentA, clientA);
    presence.join(assessmentB, clientB);

    // Each channel has only its own user
    expect(presence.getOnlineUsers(assessmentA)).toHaveLength(1);
    expect(presence.getOnlineUsers(assessmentA)[0]!.userId).toBe("user-1");

    expect(presence.getOnlineUsers(assessmentB)).toHaveLength(1);
    expect(presence.getOnlineUsers(assessmentB)[0]!.userId).toBe("user-2");

    // Client A never receives messages from assessment B
    expect(clientA.messages).toHaveLength(0);
    expect(clientB.messages).toHaveLength(0);
  });

  it("T-PRES-007: Concurrent clients (10+) are all tracked and receive broadcasts", () => {
    const clients = createConcurrentClients(12, assessmentA);

    // All 12 join
    for (const client of clients) {
      presence.join(assessmentA, client);
    }

    const online = presence.getOnlineUsers(assessmentA);
    expect(online).toHaveLength(12);

    // First client should have received 11 join broadcasts (all others)
    expect(clients[0]!.messages).toHaveLength(11);

    // Last client should have received 0 (nobody joined after them)
    expect(clients[11]!.messages).toHaveLength(0);

    // All entries are ONLINE
    expect(online.every((e) => e.status === "ONLINE")).toBe(true);

    // Channel size matches
    expect(presence.getChannelSize(assessmentA)).toBe(12);
  });
});
