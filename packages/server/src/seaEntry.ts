/**
 * SEA（Node 单二进制）入口：一个二进制跑两种角色。
 *
 * - 默认（HTTP server）：启动 entry-http，并在启动前释放内嵌的 agent bundle、
 *   把 agent 命令指回自身（NEX_AGENT_SERVER_COMMAND 走 env 覆盖链）。
 * - NEX_SEA_AGENT_ROLE=1：作为 agent 子进程被自己 spawn（单二进制没有独立的
 *   node 可执行文件，spawn process.execPath 是唯一选择），释放出的 nex.cjs
 *   被加载后进入 CLI 的 app-server --stdio 循环。
 *
 * agent 的运行时资源（playwright/koffi/官方插件/bundled skills/runtime tools）
 * 由 CLI 侧既有的 SEA 资源机制读取（node:sea getRawAsset → 释放到用户缓存目录），
 * 打包脚本（scripts/build-sea.mjs）负责把这些资产用与 CLI SEA 相同的 key 嵌入。
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

/** agent bundle 释放目录：数据目录优先（服务器场景随 NEX_DATA_BASE_DIR 落盘），否则用户缓存。 */
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
 * 把内嵌的 nex.cjs 释放到磁盘（幂等：指纹目录已存在即复用）。
 * 同步实现：server 模式在 spawn agent 前必须保证 bundle 就位，agent 模式
 * 在 CLI 消费任何参数前必须完成加载。
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
  // 注意：SEA 主脚本里不能用动态 import()（SEA 的 ESM loader 不可用，
  // import("node:sea") 会抛 ERR_UNKNOWN_BUILTIN_MODULE），必须走静态 require。
  if (!isSea()) {
    throw new Error("NEX_SEA_AGENT_ROLE=1 is only supported inside the SEA binary");
  }
  const entry = releaseAgentBundle({ getRawAsset });
  // CLI bundle 约定 process.argv.slice(2) 为用户参数。SEA 里 argv 形如
  // [execPath, ...用户参数]，补上 script 位置让两套约定对齐。
  const hasScriptPosition = process.argv[1] === join(dirname(process.execPath), "nex-server");
  const userArgs = hasScriptPosition ? process.argv.slice(2) : process.argv.slice(1);
  process.argv = [process.execPath, entry, ...userArgs];
  // SEA 主脚本里 require()/import() 被 embedder 接管，解析不了文件系统模块。
  // createRequire 基于释放路径构造标准 CJS loader：内置模块、.node 原生文件和
  // 释放目录下的相对解析全部走正常加载链。
  return createRequire(entry)(entry);
}

function prepareAgentCommandForSea(sea: { getRawAsset: (key: string) => ArrayBuffer }): void {
  if (process.env.NEX_AGENT_SERVER_COMMAND?.trim()) {
    // 显式 env 覆盖优先级最高，保持既有 resolver 语义。
    return;
  }
  const entry = releaseAgentBundle(sea);
  process.env.NEX_AGENT_SERVER_COMMAND = process.execPath;
  process.env.NEX_AGENT_SERVER_ARGS_JSON = JSON.stringify(["app-server", "--stdio"]);
  process.env.NEX_SEA_AGENT_ENTRY = entry;
  // 子进程（同一 SEA 二进制）据此进入 agent 角色。
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
