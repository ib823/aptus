import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// This runs inside Vercel's filtered checkout as well as local/CI builds.
// A tracing include cannot rescue a file removed by .vercelignore.
const asset = path.resolve("docs/coreedge-developer-guide.md");
const trace = path.resolve(
  ".next/server/app/(help)/help/developer-guide/page.js.nft.json",
);

/**
 * THE CONTRACT COMPILER'S WORKER (lib/contracts/envelope.ts). webpack emits it
 * as a chunk of its own, outside every route's chunk graph, so a route's
 * function trace leaves it out unless next.config.ts includes it — and a
 * deployed function without it compiles nothing (every verify's contract is
 * NOT_COMPILED). The chunk must exist, be the worker, and be in the trace of
 * every route that spawns it.
 */
const WORKER_CHUNK = path.resolve(".next/server/chunks/contract-compiler-worker.js");
const WORKER_MARKER = "HeapNotCapped";
const WORKER_ROUTES = [
  ".next/server/app/api/studio/interfaces/[id]/verify-service/route.js.nft.json",
  ".next/server/app/api/studio/interfaces/[id]/capture-schema/route.js.nft.json",
];

function traces(traceFile, file) {
  const manifest = JSON.parse(readFileSync(traceFile, "utf8"));
  return (
    Array.isArray(manifest.files) &&
    manifest.files.some((f) => typeof f === "string" && path.resolve(path.dirname(traceFile), f) === file)
  );
}

try {
  if (!readFileSync(asset, "utf8").trim()) {
    throw new Error("Developer guide is empty");
  }
  if (process.argv.includes("--built")) {
    if (!traces(trace, asset)) {
      throw new Error("Developer guide is missing from the Next.js function trace");
    }
    if (!existsSync(WORKER_CHUNK) || !readFileSync(WORKER_CHUNK, "utf8").includes(WORKER_MARKER)) {
      throw new Error("The contract compiler's worker chunk was not emitted as chunks/contract-compiler-worker.js");
    }
    for (const route of WORKER_ROUTES) {
      if (!traces(path.resolve(route), WORKER_CHUNK)) {
        throw new Error(`The contract compiler's worker is missing from the function trace of ${route}`);
      }
    }
  }
  console.log(
    `Runtime assets OK: developer guide ${process.argv.includes("--built") ? "present and traced; contract compiler worker emitted and traced" : "present"}`,
  );
} catch (error) {
  console.error("Runtime asset check failed:", error.message);
  process.exitCode = 1;
}
