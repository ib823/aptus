import { readFileSync } from "node:fs";

function readText(url) {
  return readFileSync(url, "utf8").trim();
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function satisfies(version, requirement) {
  const current = parseVersion(version);
  if (!current || typeof requirement !== "string") return false;

  if (/^\d+\.\d+\.\d+$/.test(requirement)) {
    return version === requirement;
  }

  const majorRange = /^(\d+)\.x$/.exec(requirement);
  if (majorRange) {
    return current.major === Number(majorRange[1]);
  }

  const caretRange = /^\^(\d+\.\d+\.\d+)$/.exec(requirement);
  if (caretRange) {
    const minimum = parseVersion(caretRange[1]);
    return minimum !== null
      && current.major === minimum.major
      && compareVersions(current, minimum) >= 0;
  }

  const minimumRange = /^>=(\d+\.\d+\.\d+)$/.exec(requirement);
  if (minimumRange) {
    const minimum = parseVersion(minimumRange[1]);
    return minimum !== null && compareVersions(current, minimum) >= 0;
  }

  return false;
}

const packageJson = JSON.parse(readText(new URL("../package.json", import.meta.url)));
const engineRange = packageJson.engines?.node;
const preferredLocalVersion = readText(new URL("../.nvmrc", import.meta.url));
const currentVersion = process.versions.node;
const isVercel = process.env.VERCEL === "1" || typeof process.env.VERCEL_ENV === "string";

if (process.env.SKIP_NODE_VERSION_CHECK === "1") {
  process.exit(0);
}

if (typeof engineRange !== "string" || !satisfies(currentVersion, engineRange)) {
  console.error(
    [
      `Node.js ${engineRange} is required by package.json for installs/builds.`,
      `Current runtime: ${currentVersion}.`,
      "Use a Node.js 22.x runtime for CI and deployment.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!isVercel && currentVersion !== preferredLocalVersion) {
  console.error(
    [
      `Node.js ${preferredLocalVersion} is required for local development in this repository.`,
      `Current runtime: ${currentVersion}.`,
      "Run `nvm use`, `asdf install`, `mise install`, or `volta install node@"
        + preferredLocalVersion
        + "` before running project commands.",
      "Set SKIP_NODE_VERSION_CHECK=1 only for controlled maintenance tasks.",
    ].join("\n"),
  );
  process.exit(1);
}
