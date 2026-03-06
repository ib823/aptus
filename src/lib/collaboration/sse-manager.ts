/**
 * SSE Connection Manager — Singleton
 *
 * One EventSource per assessmentId, shared across all subscribing components.
 * Reference counting: auto-close when all subscribers unsubscribe.
 * Visibility-aware: close on tab hide, reconnect on tab visible.
 * Reconnect with 5s backoff on error.
 */

type EventCallback = (event: MessageEvent) => void;

interface Subscriber {
  eventType: string;
  callback: EventCallback;
}

interface Connection {
  eventSource: EventSource | null;
  subscribers: Map<string, Subscriber>; // subscriberId -> subscriber
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
}

class SSEManager {
  private connections = new Map<string, Connection>();
  private subscriberCounter = 0;
  private visibilityHandler: (() => void) | null = null;

  private ensureVisibilityListener() {
    if (this.visibilityHandler || typeof document === "undefined") return;

    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        // Reconnect all connections that have active subscribers
        for (const [assessmentId, conn] of this.connections) {
          if (conn.subscribers.size > 0 && (!conn.eventSource || conn.eventSource.readyState === EventSource.CLOSED)) {
            this.connect(assessmentId);
          }
        }
      } else {
        // Close all connections to save Vercel connection limits
        for (const [, conn] of this.connections) {
          if (conn.eventSource) {
            conn.eventSource.close();
            conn.eventSource = null;
          }
        }
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private connect(assessmentId: string) {
    const conn = this.connections.get(assessmentId);
    if (!conn || conn.subscribers.size === 0) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    // Close existing if any
    if (conn.eventSource) {
      conn.eventSource.close();
    }

    try {
      const es = new EventSource(`/api/assessments/${assessmentId}/stream`);
      conn.eventSource = es;

      // Attach all subscriber event listeners
      const listenersByType = new Map<string, EventCallback[]>();
      for (const [, sub] of conn.subscribers) {
        const list = listenersByType.get(sub.eventType) || [];
        list.push(sub.callback);
        listenersByType.set(sub.eventType, list);
      }

      for (const [eventType, callbacks] of listenersByType) {
        es.addEventListener(eventType, ((event: MessageEvent) => {
          for (const cb of callbacks) {
            cb(event);
          }
        }) as EventListener);
      }

      es.onerror = () => {
        es.close();
        conn.eventSource = null;
        // Reconnect with 5s backoff
        if (conn.subscribers.size > 0) {
          conn.reconnectTimeout = setTimeout(() => {
            this.connect(assessmentId);
          }, 5000);
        }
      };
    } catch {
      // EventSource not supported
    }
  }

  /**
   * Subscribe to an event type on a specific assessment's SSE stream.
   * Returns an unsubscribe function.
   */
  subscribe(
    assessmentId: string,
    eventType: string,
    callback: EventCallback,
  ): () => void {
    this.ensureVisibilityListener();

    const subscriberId = `sub_${++this.subscriberCounter}`;

    let conn = this.connections.get(assessmentId);
    if (!conn) {
      conn = { eventSource: null, subscribers: new Map(), reconnectTimeout: null };
      this.connections.set(assessmentId, conn);
    }

    conn.subscribers.set(subscriberId, { eventType, callback });

    // Connect if this is the first subscriber or if EventSource is closed
    if (!conn.eventSource || conn.eventSource.readyState === EventSource.CLOSED) {
      this.connect(assessmentId);
    } else {
      // Add listener to existing EventSource
      conn.eventSource.addEventListener(eventType, callback as EventListener);
    }

    // Return unsubscribe function
    return () => {
      const c = this.connections.get(assessmentId);
      if (!c) return;

      c.subscribers.delete(subscriberId);

      // If no more subscribers, close the connection
      if (c.subscribers.size === 0) {
        if (c.eventSource) {
          c.eventSource.close();
          c.eventSource = null;
        }
        if (c.reconnectTimeout) {
          clearTimeout(c.reconnectTimeout);
          c.reconnectTimeout = null;
        }
        this.connections.delete(assessmentId);
      }
    };
  }
}

// Singleton instance
let instance: SSEManager | null = null;

export function getSSEManager(): SSEManager {
  if (!instance) {
    instance = new SSEManager();
  }
  return instance;
}
