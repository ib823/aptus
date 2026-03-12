import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const expectedVersion = packageJson.engines?.node;
const currentVersion = process.versions.node;

if (process.env.SKIP_NODE_VERSION_CHECK === "1") {
  process.exit(0);
}

if (typeof expectedVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  console.error("package.json engines.node must be pinned to an exact Node.js version.");
  process.exit(1);
}

if (currentVersion !== expectedVersion) {
  console.error(
    [
      `Node.js ${expectedVersion} is required for this repository.`,
      `Current runtime: ${currentVersion}.`,
      "Run `nvm use`, `asdf install`, `mise install`, or `volta install node@"
        + expectedVersion
        + "` before running project commands.",
      "Set SKIP_NODE_VERSION_CHECK=1 only for controlled maintenance tasks.",
    ].join("\n"),
  );
  process.exit(1);
}
