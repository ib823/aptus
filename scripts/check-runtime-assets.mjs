import { readFileSync } from "node:fs";
import path from "node:path";

// This runs inside Vercel's filtered checkout as well as local/CI builds.
// A tracing include cannot rescue a file removed by .vercelignore.
const asset = path.resolve("docs/coreedge-developer-guide.md");
const trace = path.resolve(
  ".next/server/app/(help)/help/developer-guide/page.js.nft.json",
);

try {
  if (!readFileSync(asset, "utf8").trim()) {
    throw new Error("Developer guide is empty");
  }
  if (process.argv.includes("--built")) {
    const manifest = JSON.parse(readFileSync(trace, "utf8"));
    if (
      !Array.isArray(manifest.files) ||
      !manifest.files.some(
        (file) =>
          typeof file === "string" &&
          path.resolve(path.dirname(trace), file) === asset,
      )
    ) {
      throw new Error("Developer guide is missing from the Next.js function trace");
    }
  }
  console.log(
    `Runtime assets OK: developer guide ${process.argv.includes("--built") ? "present and traced" : "present"}`,
  );
} catch (error) {
  console.error("Runtime asset check failed:", error.message);
  process.exitCode = 1;
}
