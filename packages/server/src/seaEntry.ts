/**
 * SEA (Node single executable) entry: one binary, two roles.
 *
 * - Default (HTTP server): boots entry-http, after releasing the embedded
 *   agent bundle and pointing the agent command back at this very binary
 *   (via the NEX_AGENT_SERVER_COMMAND env override chain).
 * - NEX_SEA_AGENT_ROLE=1: runs as the agent child process, spawned by this
 *   same binary (a single file has no standalone node executable to spawn).
 *   The released nex.cjs is loaded and enters the CLI app-server --stdio loop.
 *
 * The agent's runtime assets (playwright/koffi/official plugins/bundled
 * skills/runtime tools) are read by the stock CLI SEA asset mechanism
 * (node:sea getRawAsset -> released into the user cache directory); the
 * packaging script (scripts/build-sea.mjs) embeds them under the same asset
 * keys the CLI SEA uses.
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getRawAsset, isSea } from "node:sea";

const AGENT_BUNDLE_ASSET_KEY = "nex-sea-agent/nex.cjs";

/** Release directory for the agent bundle: data dir first (server setups set NEX_DATA_BASE_DIR), else the user cache. */
function agentRuntimeDirectory(): string {
  const dataBase = process.env.NEX_DATA_BASE_DIR?.trim();
  if (dataBase) return join(dataBase, "sea-agent");
  const home = process.env.HOME?.trim() || process.cwd();
  switch (process.platform) {
    case "darwin":
      return join(home, "Library", "Caches", "nex", "sea-agent");
    case "win32":
      return join(
        process.env.LOCALAPPDATA?.trim() || join(home, "AppData", "Local"),
        "nex",
        "sea-agent",
      );
    default:
      return join(
        process.env.XDG_CACHE_HOME?.trim() || join(home, ".cache"),
        "nex",
        "sea-agent",
      );
  }
}

function assetFingerprint(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/**
 * Release the embedded nex.cjs to disk (idempotent: the fingerprint directory
 * is reused when present). Synchronous on purpose: server mode must have the
 * bundle in place before spawning the agent, agent mode before the CLI reads
 * any arguments.
 */
function releaseAgentBundle(sea: { getRawAsset: (key: string) => ArrayBuffer }): string {
  const bytes = Buffer.from(sea.getRawAsset(AGENT_BUNDLE_ASSET_KEY));
  const targetDirectory = join(agentRuntimeDirectory(), assetFingerprint(bytes));
  const targetPath = join(targetDirectory, "nex.cjs");

  if (existsSync(targetPath)) {
    return targetPath;
  }

  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(temporaryPath, bytes);
  chmodSync(temporaryPath, 0o755);
  renameSync(temporaryPath, targetPath);
  return targetPath;
}

async function runAsAgent(): Promise<void> {
  // Note: dynamic import() is unusable in the SEA main script (the SEA ESM
  // loader is unavailable; import("node:sea") throws ERR_UNKNOWN_BUILTIN_MODULE),
  // so node:sea must be required statically.
  if (!isSea()) {
    throw new Error("NEX_SEA_AGENT_ROLE=1 is only supported inside the SEA binary");
  }
  const entry = releaseAgentBundle({ getRawAsset });
  // The CLI bundle expects user arguments at process.argv.slice(2). In a SEA
  // binary argv looks like [execPath, ...userArgs]; re-insert the script slot
  // so both conventions line up.
  const hasScriptPosition = process.argv[1] === join(dirname(process.execPath), "nex-server");
  const userArgs = hasScriptPosition ? process.argv.slice(2) : process.argv.slice(1);
  process.argv = [process.execPath, entry, ...userArgs];
  // The SEA embedder takes over require()/import() in the main script and
  // cannot resolve filesystem modules. createRequire builds a standard CJS
  // loader anchored at the released path: built-ins, .node native files and
  // relative resolution inside the release directory all work normally.
  return createRequire(entry)(entry);
}

function prepareAgentCommandForSea(sea: { getRawAsset: (key: string) => ArrayBuffer }): void {
  if (process.env.NEX_AGENT_SERVER_COMMAND?.trim()) {
    // Explicit env override wins; keep the existing resolver semantics.
    return;
  }
  const entry = releaseAgentBundle(sea);
  process.env.NEX_AGENT_SERVER_COMMAND = process.execPath;
  process.env.NEX_AGENT_SERVER_ARGS_JSON = JSON.stringify(["app-server", "--stdio"]);
  process.env.NEX_SEA_AGENT_ENTRY = entry;
  // The child process (the same SEA binary) enters the agent role based on this.
  process.env.NEX_SEA_AGENT_ROLE = "1";
}

export async function main(): Promise<void> {
  if (process.env.NEX_SEA_AGENT_ROLE === "1") {
    await runAsAgent();
    return;
  }

  if (isSea()) {
    prepareAgentCommandForSea({ getRawAsset });
  }

  await import("./entry-http.js");
}

void main().catch((error: unknown) => {
  console.error("[nex-server:sea] startup failed", error);
  process.exitCode = 1;
});
