"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { VitalRating, WebVitalMetric } from "@/types/pwa";

function getRating(name: string, value: number): VitalRating {
  const thresholds: Record<string, { good: number; poor: number }> = {
    LCP: { good: 2500, poor: 4000 },
    FID: { good: 100, poor: 300 },
    CLS: { good: 0.1, poor: 0.25 },
    INP: { good: 200, poor: 500 },
    TTFB: { good: 800, poor: 1800 },
    FCP: { good: 1800, poor: 3000 },
  };

  const t = thresholds[name];
  if (!t) return "poor";
  if (value < t.good) return "good";
  if (value < t.poor) return "needs-improvement";
  return "poor";
}

interface VitalEntry {
  name: WebVitalMetric;
  value: number;
  rating: VitalRating;
}

function sendReport(route: string, metrics: VitalEntry[]) {
  if (metrics.length === 0) return;
  const body = JSON.stringify({ route, metrics });

  // Use sendBeacon for reliability during page unload, fall back to fetch.
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/performance/report", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/performance/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Intentionally swallowed: this is fire-and-forget telemetry.
    });
  }
}

/**
 * Client component that observes Core Web Vitals using PerformanceObserver
 * and reports them to /api/performance/report.
 */
export function WebVitalsReporter() {
  const pathname = usePathname();
  const metricsRef = useRef<VitalEntry[]>([]);
  const sentRef = useRef(false);

  useEffect(() => {
    metricsRef.current = [];
    sentRef.current = false;

    const observers: PerformanceObserver[] = [];

    function recordMetric(name: WebVitalMetric, value: number) {
      metricsRef.current.push({ name, value, rating: getRating(name, value) });
    }

    try {
      // LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) recordMetric("LCP", last.startTime);
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObserver);
    } catch {
      // Not supported in this browser
    }

    try {
      // FID
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const first = entries[0];
        if (first && "processingStart" in first) {
          const fi = first as PerformanceEventTiming;
          recordMetric("FID", fi.processingStart - fi.startTime);
        }
      });
      fidObserver.observe({ type: "first-input", buffered: true });
      observers.push(fidObserver);
    } catch {
      // Not supported
    }

    try {
      // CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const le = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!le.hadRecentInput && typeof le.value === "number") {
            clsValue += le.value;
          }
        }
        // Record cumulative value
        metricsRef.current = metricsRef.current.filter((m) => m.name !== "CLS");
        recordMetric("CLS", clsValue);
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObserver);
    } catch {
      // Not supported
    }

    // FCP from paint timing
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            recordMetric("FCP", entry.startTime);
          }
        }
      });
      fcpObserver.observe({ type: "paint", buffered: true });
      observers.push(fcpObserver);
    } catch {
      // Not supported
    }

    // Send metrics after a delay to allow accumulation
    const timer = setTimeout(() => {
      if (!sentRef.current && metricsRef.current.length > 0) {
        sentRef.current = true;
        sendReport(pathname, [...metricsRef.current]);
      }
    }, 10000);

    // Also send on visibilitychange (page hide)
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && !sentRef.current && metricsRef.current.length > 0) {
        sentRef.current = true;
        sendReport(pathname, [...metricsRef.current]);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      for (const obs of observers) {
        obs.disconnect();
      }
      // Flush any remaining metrics on unmount
      if (!sentRef.current && metricsRef.current.length > 0) {
        sentRef.current = true;
        sendReport(pathname, [...metricsRef.current]);
      }
    };
  }, [pathname]);

  // This component renders nothing — it's purely a side-effect component.
  return null;
}
