import { readFileSync } from "node:fs";
import { relative } from "node:path";

/** Repository paths in assertions/allowlists use '/' on every host. */
export function repoPath(file: string, root = process.cwd()): string {
  return relative(root, file).replace(/\\/g, "/");
}

/** Source inspection compares text; integrity checks must still read raw bytes. */
export function readSource(file: string, _encoding: "utf8" = "utf8"): string {
  return readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
}
