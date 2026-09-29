import { readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { loadBuiltinProviderConfig } from "../../scripts/builtin-provider-config.mjs";
import { stageThirdPartyNotices } from "../../scripts/third-party-notices.mjs";

const { version } = JSON.parse(readFileSync("../../package.json", "utf-8"));

/**
 * SEA pre-bundle for the HTTP server: packs the entry point (and its whole
 * workspace dependency graph) into a single CJS file for scripts/build-sea.mjs
 * to inject into a Node single binary.
 *
 * Same strategy as build-remote.ts (entry-stdio, the SSH remote deployment):
 * - node-pty's JS is inlined while .node native addons stay as external
 *   requires (resolved at runtime from the SEA assets release directory)
 * - CJS instead of ESM: node-pty relies heavily on __dirname, and dynamic
 *   requires (node-forge's require("crypto"), yazl) are natively supported
 *   in CJS output
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

// Run directly: emits the single-file bundle of entry-http (also usable for
// non-SEA deployment layouts).
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
