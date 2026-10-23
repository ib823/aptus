/**
 * pnpm tsx scripts/measure-response-limit.ts — where the platform starts
 * refusing a function's response (P1.4, 3.10.2). Run once, by an operator,
 * on a preview; never in CI.
 *
 * WHY. A `?limit` read past the platform's response limit used to be audited
 * 200 and then fail with the platform's bare 413. CoreEdge now refuses it
 * itself, past LEGACY_RESPONSE_CAP (src/lib/northbound/query/page.ts), in its
 * own envelope and audited 413. Vercel documents the limit as "4.5 MB"
 * without saying whether that is 4,500,000 bytes or 4.5 MiB, or whether it
 * is counted before or after compression [unverified]; and its knowledge
 * base says streaming functions do not have the limit at all, while
 * streaming is on by default for Node.js functions. So whether the 4.5 MiB
 * the cap starts at can refuse an answer the platform serves depends on the
 * deployment. This script finds out, on a preview in the production team's
 * scope (the same plan), BEFORE the guard deploy reaches production: the cap
 * is then set to the largest body served less 16 KiB, or, when the platform
 * serves everything a `?limit` read can produce, to Infinity (no guard), in
 * a commit that cites the run.
 *
 * HOW. It bisects, to one byte, the body size at which a function's answer
 * stops being served (scripts/lib/response-limit.ts), twice: with a body gzip
 * cannot shrink (the bytes on the wire), and with one it shrinks to almost
 * nothing (whether the platform counts before compression).
 *
 *   --url "<https://…?bytes={bytes}&fill={fill}>"
 *       probe an endpoint you already have that answers a JSON body of
 *       exactly `bytes` bytes, padded with `fill` (random or zeros);
 *   (default) deploy a throwaway function that does, as a Vercel PREVIEW in
 *       your scope, probe it, and remove it. Needs VERCEL_TOKEN, and
 *       VERCEL_SCOPE (the team slug) when the token's default scope is not
 *       the one CoreEdge deploys to. It answers through the same Node.js
 *       runtime, on the same plan, as CoreEdge's routes, streaming as they
 *       do by default.
 *
 *   VERCEL_CLI   the CLI package to run with npx (default vercel@39.1.0)
 *
 * WHAT IT NEVER DOES. It sends no CoreEdge credential and reads no customer
 * data: the bodies are padding. It never deploys to production.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { capAdvice, findThreshold, SEARCH_WINDOW, type Probe, type Threshold } from "./lib/response-limit";

/**
 * The window searched: both readings of "4.5 MB" lie well inside it, and its
 * top is above anything a `?limit` read can produce, so "still served at the
 * top" means the platform refuses no legacy answer.
 */
const LOW = SEARCH_WINDOW.low;
const HIGH = SEARCH_WINDOW.high;
const TIMEOUT_MS = 60_000;

/** The throwaway function: a JSON body of exactly ?bytes= bytes, `{"pad":"…"}`. */
const FUNCTION_SOURCE = `const { randomBytes } = require("node:crypto");
module.exports = (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const bytes = Number(url.searchParams.get("bytes"));
  const zeros = url.searchParams.get("fill") === "zeros";
  if (!Number.isInteger(bytes) || bytes < 10 || bytes > 32 * 1024 * 1024) {
    res.statusCode = 400;
    res.end("bytes must be an integer from 10 to 32 MiB");
    return;
  }
  const n = bytes - 10;
  const pad = zeros ? "0".repeat(n) : randomBytes(Math.ceil((n * 3) / 4) + 3).toString("base64url").slice(0, n);
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end('{"pad":"' + pad + '"}');
};
`;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function cli(args: readonly string[]): string {
  const pkg = process.env.VERCEL_CLI || "vercel@39.1.0";
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is not set: give --url, or a token that may deploy previews to your scope.");
  const scope = process.env.VERCEL_SCOPE ? ["--scope", process.env.VERCEL_SCOPE] : [];
  // The token goes in the environment, not the argument list, where `ps` would show it.
  return execFileSync("npx", ["--yes", pkg, ...args, ...scope], {
    encoding: "utf8",
    env: { ...process.env, VERCEL_TOKEN: token },
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

/** Deploy the throwaway function as a preview; returns its URL and how to remove it. */
function deployProbe(): { template: string; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "coreedge-response-limit-"));
  mkdirSync(join(dir, "api"));
  writeFileSync(join(dir, "api", "size.js"), FUNCTION_SOURCE, "utf8");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "coreedge-response-limit-probe", private: true }), "utf8");
  const url = cli(["deploy", dir, "--yes", "--target", "preview", "--name", "coreedge-response-limit-probe"]).split("\n").pop()!.trim();
  if (!/^https:\/\/[^\s]+$/.test(url)) throw new Error("The deployment did not print its URL.");
  return {
    template: `${url}/api/size?bytes={bytes}&fill={fill}`,
    remove: () => {
      try {
        cli(["remove", url, "--yes"]);
      } catch {
        console.error(`Remove the probe deployment by hand: ${url}`);
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function probeOf(template: string, fill: "random" | "zeros"): Probe {
  return async (bytes) => {
    const url = template.replace("{bytes}", String(bytes)).replace("{fill}", fill);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        // The incompressible body is asked for as it is; the compressible one with
        // gzip, so the platform may compress it if it counts after compression.
        headers: { "accept-encoding": fill === "zeros" ? "gzip" : "identity", "cache-control": "no-cache" },
      });
      const text = await res.text();
      if (res.status === 413 || text.includes("FUNCTION_PAYLOAD_TOO_LARGE")) return false;
      if (res.status !== 200) throw new Error(`HTTP ${res.status} at ${bytes} bytes: not a size answer; stopping.`);
      if (Buffer.byteLength(text, "utf8") !== bytes) throw new Error(`Asked for ${bytes} bytes and got ${Buffer.byteLength(text, "utf8")}; the endpoint is not a size probe.`);
      return true;
    } finally {
      clearTimeout(timer);
    }
  };
}

function describe(fill: string, t: Threshold): string {
  if (!t.ok) {
    return t.reason === "LOW_BOUND_REFUSED"
      ? `${fill}: even ${LOW.toLocaleString("en")} bytes was refused (${t.probes} probes); widen the window.`
      : `${fill}: ${HIGH.toLocaleString("en")} bytes was still served (${t.probes} probes), more than a ?limit read can produce: the platform refuses no legacy answer.`;
  }
  return `${fill}: the largest body served is ${t.largestServed.toLocaleString("en")} bytes; ${t.smallestRefused.toLocaleString("en")} is refused (${t.probes} probes).`;
}

async function main(): Promise<void> {
  const given = argValue("--url");
  const probe = given ? { template: given, remove: () => undefined } : deployProbe();
  try {
    const onWire = await findThreshold(probeOf(probe.template, "random"), LOW, HIGH);
    const compressible = await findThreshold(probeOf(probe.template, "zeros"), LOW, HIGH);
    console.log(describe("incompressible", onWire));
    console.log(describe("compressible", compressible));
    const advice = capAdvice(onWire);
    if (advice.kind === "cap" && onWire.ok) {
      console.log(
        `\nSet LEGACY_RESPONSE_CAP in src/lib/northbound/query/page.ts to ${advice.cap} (${onWire.largestServed} less 16 KiB), ` +
          `in a commit that cites this run${compressible.ok && compressible.largestServed !== onWire.largestServed ? " and says the platform counts compressed bytes" : ""}.`,
      );
      console.log(JSON.stringify({ measuredAt: new Date().toISOString(), incompressible: onWire, compressible, recommendedCap: advice.cap }));
    } else if (advice.kind === "no-guard") {
      // Any cap would refuse an answer this platform serves: the guard must not refuse at all.
      console.log(
        "\nSet LEGACY_RESPONSE_CAP in src/lib/northbound/query/page.ts to Number.POSITIVE_INFINITY (no guard), in a commit that cites this run: " +
          "the platform served a body larger than a ?limit read can produce, so a lower cap would refuse answers it serves.",
      );
      console.log(JSON.stringify({ measuredAt: new Date().toISOString(), incompressible: onWire, compressible, recommendedCap: null }));
    } else {
      process.exitCode = 1;
    }
  } finally {
    probe.remove();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
