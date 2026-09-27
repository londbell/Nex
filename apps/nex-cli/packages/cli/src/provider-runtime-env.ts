import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  materializeNexBuiltinProviderConfig,
  PERSONAL_PROVIDER_CONFIG_FILE_NAME,
  NEX_BUILTIN_PROVIDER_CONFIG_FILE_ENV,
  NEX_PERSONAL_PROVIDER_CONFIG_FILE_ENV,
} from "@nex/provider-node";
import type { CliEnv } from "./env.js";

export const SEA_NEX_BUILTIN_PROVIDER_CONFIG_ASSET_KEY = "nex-provider/nex-builtin.json";

type SeaProviderConfigAssets = Pick<typeof import("node:sea"), "getAsset" | "isSea">;

interface PrepareCliProviderRuntimeEnvOptions {
  readonly argv: readonly string[];
  readonly env: CliEnv;
  readonly dataBaseDir?: string;
  readonly entrypoint?: string;
  readonly sea?: SeaProviderConfigAssets;
}

/** 为运行 Core 或写入模型选择的 CLI Entry 定位同一 Environment 的 Provider Config。 */
export async function prepareCliProviderRuntimeEnv(
  options: PrepareCliProviderRuntimeEnvOptions,
): Promise<Record<string, string>> {
  if (!requiresProviderRuntime(options.argv)) return {};

  const explicitNexBuiltin = options.env[NEX_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const explicitPersonal = options.env[NEX_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim();
  const dataBaseDir = options.dataBaseDir ?? options.env.NEX_DATA_BASE_DIR?.trim() ?? homedir();
  if (explicitNexBuiltin && explicitPersonal) {
    return {
      [NEX_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: explicitNexBuiltin,
      [NEX_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: explicitPersonal,
    };
  }

  const personalFilePath =
    explicitPersonal ?? join(dataBaseDir, ".nex", "v2", PERSONAL_PROVIDER_CONFIG_FILE_NAME);
  const nexBuiltinFilePath =
    explicitNexBuiltin ??
    (await resolveBundledNexBuiltinProviderConfig({
      dataBaseDir,
      entrypoint: options.entrypoint ?? process.argv[1],
      sea: options.sea ?? getSeaProviderConfigAssets(),
    }));

  // Built-in 只读 bundled 配置；远端下载与运行时缓存已随 zcode 控制面依赖移除。
  return {
    [NEX_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: nexBuiltinFilePath,
    [NEX_PERSONAL_PROVIDER_CONFIG_FILE_ENV]: personalFilePath,
  };
}

function requiresProviderRuntime(argv: readonly string[]): boolean {
  if (argv.some((arg) => arg === "--help" || arg === "-h" || arg === "--version" || arg === "-v")) {
    return false;
  }
  if (
    argv.some(
      (arg) =>
        arg === "--prompt" ||
        arg.startsWith("--prompt=") ||
        arg === "--target" ||
        arg.startsWith("--target="),
    )
  ) {
    return true;
  }

  const command = argv[0];
  if (command === undefined || command.startsWith("-")) return true;
  return (
    command === "tui" ||
    command === "app-server" ||
    command === "agent-server" ||
    command === "login" ||
    command === "logout"
  );
}

async function resolveBundledNexBuiltinProviderConfig(input: {
  readonly dataBaseDir: string;
  readonly entrypoint: string | undefined;
  readonly sea: SeaProviderConfigAssets | undefined;
}): Promise<string> {
  if (input.sea?.isSea()) {
    const content = input.sea.getAsset(SEA_NEX_BUILTIN_PROVIDER_CONFIG_ASSET_KEY, "utf8");
    return materializeNexBuiltinProviderConfig({
      environmentConfigRoot: join(input.dataBaseDir, ".nex", "v2"),
      content,
    });
  }

  const entrypoint = input.entrypoint?.trim();
  if (!entrypoint) throw new Error("无法定位 CLI Nex Built-in Provider Config：缺少入口路径");
  // 全局 bin 可以是软链接，随包配置必须相对真实入口定位。
  const entryDirectory = dirname(realpathSync(resolve(entrypoint)));
  const candidates = [
    join(entryDirectory, "provider", "nex-builtin.json"),
    resolve(entryDirectory, "../../../../../config/provider/nex-builtin.json"),
  ];
  const candidate = candidates.find((filePath) => existsSync(filePath));
  if (candidate) return candidate;
  throw new Error(`无法定位 CLI Nex Built-in Provider Config：${candidates.join(", ")}`);
}

function getSeaProviderConfigAssets(): SeaProviderConfigAssets | undefined {
  const getBuiltinModule = process.getBuiltinModule as
    | ((id: "node:sea") => typeof import("node:sea"))
    | undefined;
  return getBuiltinModule?.("node:sea");
}
