#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const buildBinDir = path.join(repoRoot, "build", "bin");
const platformBinaryName = process.platform === "win32" ? "codex.exe" : "codex";
const targetTripleByPlatformArch = {
  "linux:x64": "x86_64-unknown-linux-musl",
  "linux:arm64": "aarch64-unknown-linux-musl",
  "android:x64": "x86_64-unknown-linux-musl",
  "android:arm64": "aarch64-unknown-linux-musl",
  "darwin:x64": "x86_64-apple-darwin",
  "darwin:arm64": "aarch64-apple-darwin",
  "win32:x64": "x86_64-pc-windows-msvc",
  "win32:arm64": "aarch64-pc-windows-msvc",
};
const platformPackageByTarget = {
  "x86_64-unknown-linux-musl": "@openai/codex-linux-x64",
  "aarch64-unknown-linux-musl": "@openai/codex-linux-arm64",
  "x86_64-apple-darwin": "@openai/codex-darwin-x64",
  "aarch64-apple-darwin": "@openai/codex-darwin-arm64",
  "x86_64-pc-windows-msvc": "@openai/codex-win32-x64",
  "aarch64-pc-windows-msvc": "@openai/codex-win32-arm64",
};

const isFile = (targetPath) => {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
};

const isExecutableFile = (targetPath) => {
  if (!isFile(targetPath)) return false;
  if (process.platform === "win32") return true;
  try {
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const normalizeCandidate = (candidate) => {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  let resolved = trimmed;
  try {
    if (fs.statSync(trimmed).isDirectory()) {
      resolved = path.join(trimmed, platformBinaryName);
    }
  } catch {
    return null;
  }

  return isExecutableFile(resolved) ? fs.realpathSync(resolved) : null;
};

const resolveNativeBinaryFromLauncher = (launcherPath) => {
  if (path.basename(launcherPath) !== "codex.js") return null;

  const targetKey = `${process.platform}:${process.arch}`;
  const targetTriple = targetTripleByPlatformArch[targetKey];
  if (!targetTriple) return null;

  const packageRoot = path.resolve(path.dirname(launcherPath), "..");
  const packageName = platformPackageByTarget[targetTriple];
  const candidates = [
    path.join(packageRoot, "vendor", targetTriple, "codex", platformBinaryName),
    path.join(packageRoot, "node_modules", packageName, "vendor", targetTriple, "codex", platformBinaryName),
  ];

  for (const candidate of candidates) {
    if (isExecutableFile(candidate)) {
      return fs.realpathSync(candidate);
    }
  }

  return null;
};

const discoverPathCandidates = () => {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const output = execFileSync(command, ["codex"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

const candidatePool = [
  process.env.CODEX_CLI_PATH ?? "",
  process.env.CUSTOM_CLI_PATH ?? "",
  ...discoverPathCandidates(),
];

let sourceBinaryPath = null;
for (const candidate of candidatePool) {
  const resolved = normalizeCandidate(candidate);
  if (resolved) {
    sourceBinaryPath = resolveNativeBinaryFromLauncher(resolved) ?? resolved;
    break;
  }
}

if (!sourceBinaryPath) {
  console.error(
    "[prepare:codex-bin] Unable to locate Codex CLI binary. Set CODEX_CLI_PATH to a valid codex executable."
  );
  process.exit(1);
}

fs.mkdirSync(buildBinDir, { recursive: true });
const destination = path.join(buildBinDir, platformBinaryName);
const staleAlternate = path.join(buildBinDir, platformBinaryName === "codex" ? "codex.exe" : "codex");

fs.copyFileSync(sourceBinaryPath, destination);
if (process.platform !== "win32") {
  fs.chmodSync(destination, 0o755);
}
if (isFile(staleAlternate)) {
  fs.unlinkSync(staleAlternate);
}

console.log(`[prepare:codex-bin] Source: ${sourceBinaryPath}`);
console.log(`[prepare:codex-bin] Wrote: ${destination}`);
