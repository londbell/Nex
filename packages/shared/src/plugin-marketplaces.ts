export interface DefaultPluginMarketplace {
  id: string;
  source: string;
  name: string;
  description: string;
  pluginCount: number;
  lastUpdated?: string;
}

export const NEX_OFFICIAL_PLUGIN_MARKETPLACE_ID = "nex-plugins-official";

/** Settings 三类资源发现共用；Bootstrap 单测与官方 definition 的 defaultEnabled 机械对照。 */
export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set([
  "browser-use@nex-plugins-official",
  "image-search@nex-plugins-official",
  "documents@nex-plugins-official",
  "pdf@nex-plugins-official",
  "presentations@nex-plugins-official",
  "spreadsheets@nex-plugins-official",
  // node_repl 宿主：不进市场、不对用户露出，也不贡献任何 skill/command/subagent，但必须
  // 始终可用 —— node_repl 的注册门禁是「Browser Use 或 Computer Use 任一启用」，宿主自己
  // 不参与那个判断。Browser Use 默认开着，宿主若默认关就等于它上来就没有宿主。
  "node-repl-host@nex-plugins-official",
  "skill-creator@nex-plugins-official",
  "plugin-creator@nex-plugins-official",
  "nex-guide@nex-plugins-official",
  // 电脑控制回退为默认关闭，故 computer-use 不在此名单内。
  // 该集合必须与 official-plugin-definitions.ts 里标了 defaultEnabled 的插件逐一对应，
  // bootstrap 的「Settings 默认启用集合与 CLI 的官方插件声明一致」单测机械对照两者。
]);

/**
 * Nex 不预置任何插件市场：内置能力（node-repl-host、browser-use 等）走本地 seed，
 * 不依赖市场；可选扩展一律由用户自行添加市场源（git / GitHub / URL / 本地路径）。
 *
 * 历史上这里预置过 ZCode 官方 CDN 市场；该源已随 fork 裁剪（上游 CDN 无 nex 分片），
 * `ensureDefaultPluginMarketplaces` 会把存量安装里残留的该记录一并清掉。
 * 本数组保留为扩展点：将来若自建官方市场，在此预置即可。
 */
export const DEFAULT_PLUGIN_MARKETPLACES: DefaultPluginMarketplace[] = [];

/** 存量安装可能残留的官方市场 id（现 id + 改名前的旧 id），迁移时一并清除。 */
export const RETIRED_PRESET_MARKETPLACE_IDS: ReadonlySet<string> = new Set([
  NEX_OFFICIAL_PLUGIN_MARKETPLACE_ID,
  "zcode-plugins-official",
]);

// 商店「公开」分段只有一个 Nex 官方市场 id，内置与 CDN 不再拆分身份。
export const PUBLIC_STORE_MARKETPLACE_IDS = [NEX_OFFICIAL_PLUGIN_MARKETPLACE_ID] as const;

export function isPublicStoreMarketplaceId(id: string): boolean {
  return (PUBLIC_STORE_MARKETPLACE_IDS as readonly string[]).includes(id);
}
