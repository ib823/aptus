/**
 * ABeam Workbench — the client half of the seam: Present follows the driver.
 *
 * Mounted inside Present mode. Subscribes to /d/live and navigates when the
 * consultant moves the room to another process.
 *
 * DEGRADES GRACEFULLY (the stated requirement):
 *  - EventSource reconnects on its own; on repeated failure we fall back to a
 *    slow poll of the same endpoint's data via router.refresh(), so a reviewer
 *    behind a proxy that eats event-streams still follows, just less promptly.
 *  - If nothing is driving, this does nothing at all — a reviewer exploring on
 *    their own is never yanked to another page.
 *  - It only navigates when the driven process actually CHANGES, and never away
 *    from a process the reviewer navigated to themselves after the last drive.
 *
 * It carries no UI of its own except the live badge: the client's view stays the
 * calm client view (brief §8 — "the projected screen shows only the calm client
 * view").
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface DrivePayload {
  live: boolean;
  processId: string | null;
}

const FALLBACK_POLL_MS = 15_000;

export interface PresentFollowerProps {
  /** The process this page is showing, so we only move on a real change. */
  currentProcessId: string;
}

export function PresentFollower({ currentProcessId }: PresentFollowerProps) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const current = useRef(currentProcessId);
  current.current = currentProcessId;

  useEffect(() => {
    let source: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let failures = 0;
    let cancelled = false;

    const apply = (p: DrivePayload) => {
      setLive(p.live);
      if (!p.live || !p.processId) return;
      if (p.processId !== current.current) {
        router.push(`/d/process/${encodeURIComponent(p.processId)}`);
      }
    };

    const startFallback = () => {
      if (fallback) return;
      // The stream is unavailable — keep following, just slowly.
      fallback = setInterval(() => router.refresh(), FALLBACK_POLL_MS);
    };

    const connect = () => {
      if (cancelled) return;
      try {
        source = new EventSource("/d/live");
      } catch {
        startFallback();
        return;
      }
      source.addEventListener("drive", (e) => {
        failures = 0;
        if (fallback) {
          clearInterval(fallback);
          fallback = null;
        }
        try {
          apply(JSON.parse((e as MessageEvent).data) as DrivePayload);
        } catch {
          // A malformed frame is not worth tearing the room's view down for.
        }
      });
      source.onerror = () => {
        failures += 1;
        source?.close();
        source = null;
        // EventSource retries on its own; after a few real failures, assume the
        // stream cannot survive this network and degrade rather than thrash.
        if (failures >= 3) startFallback();
        else if (!cancelled) setTimeout(connect, 5_000);
      };
    };

    connect();
    return () => {
      cancelled = true;
      source?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [router]);

  if (!live) return null;

  return (
    <p className="fixed right-12 top-8 z-20 inline-flex items-center gap-2 rounded-pill bg-cta-focus px-3 py-1 text-[11px] font-bold text-cta">
      <span className="size-1.5 rounded-pill bg-cta" aria-hidden="true" />
      {/* The client's own honest statement of what is happening — the room is
          being walked through this by a facilitator. */}
      <span aria-live="polite">Following the session</span>
    </p>
  );
}
