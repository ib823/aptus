import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(entryPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

describe("assessment route hardening coverage", () => {
  it("requires the shared assessment guard for every mutating [id] route", () => {
    const root = path.resolve(process.cwd(), "src/app/api/assessments/[id]");
    const mutationRoutes = collectRouteFiles(root).filter((file) =>
      /export async function (POST|PUT|PATCH|DELETE)/.test(readFileSync(file, "utf8")),
    );

    const missingGuard = mutationRoutes.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !source.includes("requireAssessmentAccess");
    });

    expect(missingGuard).toEqual([]);
  });

  it("avoids raw request.json() in mutating [id] routes", () => {
    const root = path.resolve(process.cwd(), "src/app/api/assessments/[id]");
    const mutationRoutes = collectRouteFiles(root).filter((file) =>
      /export async function (POST|PUT|PATCH|DELETE)/.test(readFileSync(file, "utf8")),
    );

    const rawJsonUsers = mutationRoutes.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("request.json()");
    });

    expect(rawJsonUsers).toEqual([]);
  });
});
