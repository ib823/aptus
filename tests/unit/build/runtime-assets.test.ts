// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const script = path.join(root, "scripts/check-runtime-assets.mjs");
const asset = "docs/coreedge-developer-guide.md";
const trace = ".next/server/app/(help)/help/developer-guide/page.js.nft.json";
const fixturePrefix = path.join(os.tmpdir(), "aptus-runtime-assets-");
const fixtures: string[] = [];

function fixture() {
  const dir = mkdtempSync(fixturePrefix);
  fixtures.push(dir);
  return dir;
}

function write(dir: string, file: string, content: string) {
  const target = path.join(dir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function check(dir: string, built = false) {
  return spawnSync(process.execPath, [script, ...(built ? ["--built"] : [])], {
    cwd: dir,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) {
    if (!path.resolve(dir).startsWith(fixturePrefix)) throw new Error("Invalid fixture path");
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("developer-guide deployment assets", () => {
  it("keeps the runtime guide under the effective upload rules while excluding other docs", () => {
    const dir = fixture();
    const init = spawnSync("git", ["init", "--quiet", dir], { encoding: "utf8" });
    expect(init.status, init.stderr).toBe(0);
    // .vercelignore uses gitignore rules; exercise the matcher, not source strings.
    write(dir, ".gitignore", readFileSync(path.join(root, ".vercelignore"), "utf8"));
    const kept = [asset, "scripts/check-runtime-assets.mjs", "src/app/api/coverage/route.ts"];
    const excluded = ["docs/README.md", "docs/coreedge/runbook.md", "tests/unit/example.ts", "logs/build.log"];
    const result = spawnSync(
      "git",
      ["-c", "core.excludesFile=", "check-ignore", "--no-index", "--stdin"],
      { cwd: dir, input: [...kept, ...excluded].join("\n") + "\n", encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual(excluded);
  });

  it("rejects a filtered checkout that has lost the guide before building", () => {
    const result = check(fixture());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Runtime asset check failed");
  });

  it("rejects an empty guide", () => {
    const dir = fixture();
    write(dir, asset, " \n");
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Developer guide is empty");
  });

  it("accepts the repository guide in a filtered checkout before building", () => {
    const dir = fixture();
    write(dir, asset, readFileSync(path.join(root, asset), "utf8"));
    const result = check(dir);
    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects a build without a function trace", () => {
    const dir = fixture();
    write(dir, asset, "# Developer guide");
    expect(check(dir, true).status).toBe(1);
  });

  it.each([
    { files: [] },
    { files: ["docs/coreedge-developer-guide.md"] },
    { files: "../../../../../../docs/coreedge-developer-guide.md" },
  ])("rejects an absent or incorrectly resolved asset in the trace: %j", (manifest) => {
    const dir = fixture();
    write(dir, asset, "# Developer guide");
    write(dir, trace, JSON.stringify(manifest));
    const result = check(dir, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing from the Next.js function trace");
  });

  it("accepts a build whose function trace resolves to the actual guide", () => {
    const dir = fixture();
    write(dir, asset, readFileSync(path.join(root, asset), "utf8"));
    write(dir, trace, JSON.stringify({ files: [path.relative(path.dirname(trace), asset)] }));
    const result = check(dir, true);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("present and traced");
  });
});
