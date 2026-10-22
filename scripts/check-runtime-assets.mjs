import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

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
  ".next/server/app/api/studio/interfaces/[id]/capture-fixture/route.js.nft.json",
  ".next/server/app/api/studio/interfaces/[id]/scaffold/route.js.nft.json",
  ".next/server/app/api/studio/solutions/[id]/openapi/route.js.nft.json",
];

function traces(traceFile, file) {
  const manifest = JSON.parse(readFileSync(traceFile, "utf8"));
  return (
    Array.isArray(manifest.files) &&
    manifest.files.some((f) => typeof f === "string" && path.resolve(path.dirname(traceFile), f) === file)
  );
}

/**
 * THE WORKER STARTS FROM WHAT THE TRACE SHIPS (structural hardening round 3).
 * Tracing the worker chunk is not enough: a chunk can load companion chunks
 * (webpack's `require("./96351.js")`), and a deployed function has only the
 * files its trace lists — capture-schema's lacked the companion, so its
 * worker died MODULE_NOT_FOUND on Vercel while `next start`, serving the
 * whole .next directory, worked. So each spawning route's trace is copied,
 * file for file and at the same relative paths, into a directory of its own,
 * and the worker is started there with a real job (a diff of nothing, which
 * answers at once). A trace from which it cannot start fails the build.
 */
const WORKER_START_TIMEOUT_MS = 30_000;

async function workerStartsFromTrace(traceFile) {
  const root = process.cwd();
  const mirror = mkdtempSync(path.join(os.tmpdir(), "aptus-worker-trace-"));
  try {
    const manifest = JSON.parse(readFileSync(traceFile, "utf8"));
    for (const f of manifest.files) {
      const from = path.resolve(path.dirname(traceFile), f);
      const rel = path.relative(root, from);
      if (rel.startsWith("..") || path.isAbsolute(rel) || !existsSync(from) || !statSync(from).isFile()) continue;
      const to = path.join(mirror, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
    const chunk = path.join(mirror, path.relative(root, WORKER_CHUNK));
    return await new Promise((resolve) => {
      const worker = new Worker(chunk, {
        workerData: { job: { kind: "diff", input: { previous: [], next: {} } }, heapLimitBytes: Number.MAX_SAFE_INTEGER },
        stdout: true,
        stderr: true,
      });
      const done = (r) => {
        clearTimeout(timer);
        void worker.terminate();
        resolve(r);
      };
      const timer = setTimeout(() => done({ ok: false, why: `no answer in ${WORKER_START_TIMEOUT_MS} ms` }), WORKER_START_TIMEOUT_MS);
      worker.once("message", (m) => done(m && m.ok === true ? { ok: true } : { ok: false, why: `answered ${JSON.stringify(m)}` }));
      worker.once("error", (err) => done({ ok: false, why: `${err.code ?? err.name}: ${err.message}` }));
      worker.once("exit", (code) => done({ ok: false, why: `exited ${code} without answering` }));
    });
  } finally {
    rmSync(mirror, { recursive: true, force: true });
  }
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
    for (const route of WORKER_ROUTES) {
      const started = await workerStartsFromTrace(path.resolve(route));
      if (!started.ok) {
        throw new Error(`The contract compiler's worker cannot start from the function trace of ${route} (${started.why})`);
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
