#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const VERSION_ARGUMENTS = new Set([
  "major",
  "minor",
  "patch",
  "premajor",
  "preminor",
  "prepatch",
  "prerelease"
]);

const options = parseArgs(process.argv.slice(2));

if (options.help || !options.version) {
  printHelp();
  process.exit(options.help ? 0 : 1);
}

const currentVersion = readPackageVersion();
const latestTagVersion = readLatestTagVersion();
const bumpBaseVersion = chooseNewerVersion(currentVersion, latestTagVersion);
const versionArg = normalizeVersionArg(options.version);
const nextVersion = resolveNextVersion(versionArg, bumpBaseVersion);
const tagName = `v${nextVersion}`;
const branchName = runGit(["rev-parse", "--abbrev-ref", "HEAD"], { stdio: "pipe" }).trim();

if (branchName === "HEAD") {
  fail("Refusing to release from detached HEAD.");
}

if (options.dryRun) {
  console.log(`[dry-run] current version: ${currentVersion}`);
  console.log(`[dry-run] latest local tag: ${latestTagVersion ? `v${latestTagVersion}` : "none"}`);
  console.log(`[dry-run] bump base: ${bumpBaseVersion}`);
  console.log(`[dry-run] next version: ${nextVersion}`);
  console.log(`[dry-run] tag: ${tagName}`);
  console.log(`[dry-run] branch: ${branchName}`);
  console.log("[dry-run] would run: npm version --no-git-tag-version ...");
  console.log("[dry-run] would run: npm run typecheck");
  console.log("[dry-run] would commit, tag, and push branch + tag.");
  process.exit(0);
}

ensureCleanWorktree();
ensureTagAvailable(tagName);

console.log(`Bumping ${currentVersion} -> ${nextVersion}`);
run("npm", ["version", "--no-git-tag-version", nextVersion]);

if (!options.skipChecks) {
  run("npm", ["run", "typecheck"]);
}

runGit(["add", "package.json", "package-lock.json"]);
runGit(["commit", "-m", `chore: release ${tagName}`]);
runGit(["tag", "-a", tagName, "-m", tagName]);

if (!options.noPush) {
  runGit(["push", "origin", branchName]);
  runGit(["push", "origin", tagName]);
}

console.log(`Released ${tagName}${options.noPush ? " locally" : ""}.`);

function parseArgs(args) {
  const parsed = {
    version: "",
    dryRun: false,
    noPush: false,
    skipChecks: false,
    help: false
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--no-push") {
      parsed.noPush = true;
      continue;
    }

    if (arg === "--skip-checks") {
      parsed.skipChecks = true;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (!parsed.version) {
      parsed.version = arg;
      continue;
    }

    fail(`Unexpected argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run release:version -- <version|bump> [options]

Examples:
  npm run release:version -- patch
  npm run release:version -- 0.1.0
  npm run release:version -- v0.1.0 --no-push
  npm run release:version -- minor --dry-run

Options:
  --dry-run       Print the planned version/tag without changing files.
  --no-push       Commit and tag locally, but do not push.
  --skip-checks   Skip npm run typecheck before committing.
  -h, --help      Show this help.

The script requires a clean worktree, updates package.json and package-lock.json,
commits "chore: release vX.Y.Z", creates an annotated vX.Y.Z tag, then pushes
the current branch and tag to origin. Bump types use the newer of package.json
version and the latest local v* tag as their base version.`);
}

function normalizeVersionArg(value) {
  return value.startsWith("v") && !VERSION_ARGUMENTS.has(value) ? value.slice(1) : value;
}

function resolveNextVersion(value, baseVersion) {
  if (VERSION_ARGUMENTS.has(value)) {
    return incrementVersion(baseVersion, value);
  }

  if (!isValidVersion(value)) {
    fail(`Invalid version or bump type: ${value}`);
  }

  return value;
}

function incrementVersion(version, bump) {
  const parsed = parseVersion(version);

  if (bump === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }

  if (bump === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  if (bump === "premajor") {
    return `${parsed.major + 1}.0.0-0`;
  }

  if (bump === "preminor") {
    return `${parsed.major}.${parsed.minor + 1}.0-0`;
  }

  if (bump === "prepatch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-0`;
  }

  if (bump === "prerelease") {
    if (parsed.prerelease) {
      return `${parsed.major}.${parsed.minor}.${parsed.patch}-${incrementPrerelease(parsed.prerelease)}`;
    }

    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-0`;
  }

  fail(`Unsupported bump type: ${bump}`);
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);

  if (!match) {
    fail(`Cannot bump invalid package version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? ""
  };
}

function incrementPrerelease(prerelease) {
  const parts = prerelease.split(".");
  const last = parts[parts.length - 1];

  if (/^\d+$/.test(last)) {
    parts[parts.length - 1] = String(Number(last) + 1);
    return parts.join(".");
  }

  return `${prerelease}.0`;
}

function readPackageVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function readLatestTagVersion() {
  const tags = runGit(["tag", "--list", "v[0-9]*", "--sort=-version:refname"], {
    stdio: "pipe"
  })
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);

  for (const tag of tags) {
    const version = tag.replace(/^v/, "");

    if (isValidVersion(version)) {
      return version;
    }
  }

  return "";
}

function chooseNewerVersion(packageVersion, tagVersion) {
  if (!tagVersion) {
    return packageVersion;
  }

  return compareVersions(tagVersion, packageVersion) > 0 ? tagVersion : packageVersion;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);

  for (const part of ["major", "minor", "patch"]) {
    if (left[part] !== right[part]) {
      return left[part] > right[part] ? 1 : -1;
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }

  if (!left.prerelease) {
    return 1;
  }

  if (!right.prerelease) {
    return -1;
  }

  return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true });
}

function isValidVersion(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function ensureCleanWorktree() {
  const status = runGit(["status", "--porcelain=v1"], { stdio: "pipe" }).trim();

  if (status) {
    fail(`Refusing to release with a dirty worktree:\n${status}`);
  }
}

function ensureTagAvailable(tagName) {
  try {
    runGit(["rev-parse", "--verify", `refs/tags/${tagName}`], { stdio: "pipe" });
    fail(`Tag already exists locally: ${tagName}`);
  } catch (error) {
    if (error.status === 0) {
      throw error;
    }
  }

  const remoteTag = runGit(["ls-remote", "--tags", "origin", `refs/tags/${tagName}`], {
    stdio: "pipe"
  }).trim();

  if (remoteTag) {
    fail(`Tag already exists on origin: ${tagName}`);
  }
}

function runGit(args, options = {}) {
  return run("git", args, options);
}

function run(command, args, options = {}) {
  const stdio = options.stdio ?? "inherit";

  return execFileSync(command, args, {
    encoding: "utf8",
    stdio
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
