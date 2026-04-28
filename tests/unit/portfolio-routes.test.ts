/**
 * Phase 8 — AD-9: portfolio surface route presence.
 *
 * Snapshots that the new /insights routes exist + each renders a default
 * export. Doesn't render the components (Next.js server components need
 * a full request context); just import-shape.
 */

import { describe, it, expect } from "vitest";

const ROUTES = [
  "@/app/(portal)/insights/page",
  "@/app/(portal)/insights/activity/page",
  "@/app/(portal)/insights/benchmarks/page",
  "@/app/(portal)/insights/triggers/page",
  "@/app/(portal)/insights/phase-bridge/page",
  "@/app/(portal)/insights/patterns/page",
];

describe("Phase 8 — portfolio surface routes exist", () => {
  for (const route of ROUTES) {
    it(`${route} exports a default page component`, async () => {
      const mod = await import(route);
      expect(typeof mod.default).toBe("function");
    });
  }
});
