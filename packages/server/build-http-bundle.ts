import { readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { loadBuiltinProviderConfig } from "../../scripts/builtin-provider-config.mjs";
import { stageThirdPartyNotices } from "../../scripts/third-party-notices.mjs";

const { version } = JSON.parse(readFileSync("../../package.json", "utf-8"));

/**
 * HTTP server 的 SEA 前置 bundle：把入口（及其整个 workspace 依赖图）打成
 * 单文件 CJS，供 scripts/build-sea.mjs 注入 Node 单二进制。
 *
 * 与 build-remote.ts（entry-stdio，SSH 远端部署形态）同源同策略：
 * - node-pty 的 JS 内联、.node 原生文件保持 external require（运行时从 SEA
 *   assets 释放目录解析，见 sea-native-runtime.ts）
 * - CJS 而非 ESM：node-pty 大量使用 __dirname，且 CJS 里 dynamic require
 *   （node-forge 的 require("crypto")、yazl）由 Node 原生支持
 */
const nativeAddonPlugin: Plugin = {
  name: "native-addon",
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

export interface HttpBundleOptions {
  entryPoint: string;
  outfile: string;
}

export async function buildHttpBundle({ entryPoint, outfile }: HttpBundleOptions) {
  const { content: nexBuiltinProviderConfigJson } = await loadBuiltinProviderConfig();

  const buildResult = await build({
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    platform: "node",
    format: "cjs",
    target: "node24",
    plugins: [nativeAddonPlugin],
    minify: false,
    sourcemap: false,
    banner: {
      js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href; var __import_meta_dirname = __dirname;',
    },
    define: {
      "import.meta.url": "__import_meta_url",
      "import.meta.dirname": "__import_meta_dirname",
      __NEX_VERSION__: JSON.stringify(version),
      __NEX_BUILTIN_PROVIDER_CONFIG_JSON__: JSON.stringify(nexBuiltinProviderConfigJson),
    },
    metafile: true,
  });

  const bundledInputs = Object.keys(buildResult.metafile.inputs);
  const externalNative = bundledInputs.filter((input) => input.endsWith(".node"));
  if (externalNative.length > 0) {
    throw new Error(`Native addon leaked into bundle inputs: ${externalNative.join(", ")}`);
  }

  return { bundledInputs, version };
}

// 直接运行：产出 entry-http 的单文件 bundle（SEA 之外的部署形态也能用）。
const entryPath = process.argv[1];
if (entryPath && import.meta.url === new URL(`file://${entryPath}`).href) {
  const { bundledInputs, version: bundleVersion } = await buildHttpBundle({
    entryPoint: "src/entry-http.ts",
    outfile: "dist/sea/nex-server-http.cjs",
  });
  await stageThirdPartyNotices("dist/sea");
  console.log(
    `Built dist/sea/nex-server-http.cjs (${bundledInputs.length} modules, version ${bundleVersion})`,
  );
}
