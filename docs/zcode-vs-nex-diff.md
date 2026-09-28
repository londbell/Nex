# ZCode 产品 vs Nex 差异对比

> 状态：参考文档（非 spec）。对比对象：官方产品 `ZCode.app 3.14.3`
> （`/Applications/ZCode.app`）与本仓库（fork 自
> [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3 开源版）。
> 已裁剪的功能（遥测、账号体系、ZCode 更新通道等）不在本对比范围内。
> 分析日期：2026-09-28。CUA 的实现级差异见
> [cua-product-implementation-analysis.md](./cua-product-implementation-analysis.md)。

## 0. 结论概览

两边同源，模型 provider 配置（`config/provider/`，revision 30）**完全一致**。
实质差异集中在两处：

1. **插件分发体系**：产品把全部 15 个官方插件本地 seed 进 `Resources/glm/packages/`，
   零网络依赖；本仓库只内嵌 2 个（node-repl-host + browser-use），其余没有
   本地 seed，而 CDN 又拿不到（见 §2，含一个 rename 半成品 bug）。
2. **产品独占组件**：CUA 全套（Helper + native addon + SDK）、内容型插件
   （docx/pdf/pptx/xlsx）、模拟器插件、新版指南技能。

## 1. 内置插件对比（核心差异）

产品插件位于 `ZCode.app/Contents/Resources/glm/packages/<name>/`；
本仓库对应 seed 根是 `apps/nex-cli/packages/<name>`，SEA 内嵌清单在
`apps/nex-cli/packages/cli/scripts/sea-official-plugin-assets.mjs`
（`officialSeaPlugins`），官方插件声明在
`apps/nex-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`。

| 插件 | 产品（本地 seed） | Nex fork | 差异说明 |
| --- | --- | --- | --- |
| node-repl-host | ✅ 0.6.0 | ✅ 有（SEA 内嵌） | 产品版 `dist/mcp/server.js` 含**真实 CUA staging runtime**；本仓库版无 |
| browser-use | ✅ 0.5.1 | ✅ 0.5.1 | **逐文件一致**（docs / skills 全同） |
| bundled-skills（dynamic-workflows） | ✅ | ✅ | 内容一致（产品多一个 README） |
| **computer-use（zcode-cua）** | ✅ 0.6.3 + Helper + ax_native.node | ❌ 无 SDK、无 Helper | 见 CUA 分析文档 |
| **documents（docx）** | ✅ 0.1.7（skills + visual-judge agent） | ❌ 无本地 seed | CDN 上也不可下载（见 §2） |
| **pdf** | ✅ 0.1.7 | ❌ | 同上 |
| **presentations（pptx）** | ✅ 0.1.7 | ❌ | 同上 |
| **spreadsheets（xlsx）** | ✅ 0.1.7 | ❌ | 同上 |
| image-search | ✅ 0.1.1（MCP server） | ❌ | 同上 |
| skill-creator | ✅ 0.1.0 | ❌ | 同上 |
| plugin-creator | ✅ 0.1.1 | ❌ | 同上 |
| **nex-guide（zcode-guide）** | ✅ **0.3.0**：`zcode-configuration-guide` + 5 个 diagnosing 技能（hooks / commands / mcp / plugins / skills） | 定义还停在 **0.2.0**：期望 `commands/workflow.md` + dynamic-workflows，且 seed 目录不存在 | 内容与版本双重落后 |
| android-emulator | ✅ 0.1.0（MCP server，koffi） | ❌ | 官方定义里有（`defaultEnabled=false`），无 seed |
| ios-simulator | ✅ 0.1.0（MCP server） | ❌ | 同上 |
| restore-legacy-sessions | ✅ 0.1.0 | ❌ | 恢复 ZCode 旧会话；对 nex（数据目录已迁 `~/.nex`）意义不大 |
| superpowers-plugin | — | ⚠️ **空壳**（只有 LICENSE，git 历史从未有过内容） | 建议删除目录 |

**结论：nex 开箱只有 browser-use + node-repl-host + dynamic-workflows 技能包**；
产品多 13 个插件。

## 2. rename 半成品问题（✅ 已修复，见 PR `refactor/remove-default-plugin-marketplace`）

> 2026-09-28 更新：随「移除默认插件市场」一并解决——`DEFAULT_PLUGIN_MARKETPLACES`
> 清空（不预置任何市场，添加市场源能力保留），存量安装的官方市场残留记录在
> `ensureDefaultPluginMarketplaces` 读取时清除，官方插件 id 统一为 `@nex-plugins-official`
> （旧 id 作兼容别名自动归一），商店页官方目录自动刷新已移除。
> 以下为修复前的分析记录，供追溯。

CHANGELOG「已知保留项」写着*「插件市场仍使用 `zcode-plugins-official` ID 与
z.ai CDN（后续单独处理）」*，但 rename commit `793da45` 实际改了一半，
形成**混合状态**：

| 位置 | 现状 | 后果 |
| --- | --- | --- |
| `apps/nex-cli/packages/contracts/src/plugins/index.ts` | `NEX_OFFICIAL_PLUGIN_MARKETPLACE = "nex-plugins-official"`；bootstrap 据此拼全部官方插件 id | id 空间基准 |
| `packages/shared/src/plugin-marketplaces.ts` | marketplace 定义（id + source URL）已改 `nex`；但 **`DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS` 的 11 个 id 仍是 `@zcode-plugins-official`** | `enabledPlugins[id] ?? defaultEnabled` 判定两边对不上，默认启用集合失效 |
| `packages/shared/src/mcp.ts` | `NEX_CUA_OFFICIAL_PLUGIN_ID = "computer-use@zcode-plugins-official"`，被 bootstrap 装配引用 | 与 bootstrap 的 `computer-use@nex-plugins-official` 不一致，CUA 归属判定会落空 |
| marketplace URL | `https://cdn-zcode.z.ai/nex/official-plugin/marketplace.json` | **404**（实测；真实路径 `/zcode/official-plugin/...` 返回 200） |
| 图标资产 URL | `official-plugin-definitions.ts` 的 `OFFICIAL_PLUGIN_ASSETS_BASE_URL` 指向 `/nex/official-plugin/assets/<name>/icon.png` | **404**（`/zcode/` 路径 200） |
| remote runtime CDN | `packages/desktop/src/main/remoteCdn.ts` → `cdn-zcode.z.ai/nex/electron/releases/<ver>/` | **404**，remote agent 运行时下载断链 |
| CDN 市场内容 | 真实 manifest 的 name 是 `zcode-plugins-official`，**仅 26 个社区插件**（github / gitlab / lark-cli / wind / 同花顺 / 天眼查…），**不含任何官方内置插件** | 即使修好 URL，内容型插件也无 CDN 源——它们只随产品本地分发 |

残留引用统计：`zcode-plugins-official` 共 **83 处、9 个文件**
（`plugin-marketplaces.ts`、`mcp.ts`、`pluginCreatorPrefill.ts`、
`featureSuggestedPrompts.ts`、`pluginIconSource.ts`、`builtinSkillI18n.ts`、
`plugin-reference-catalog.ts`、`plugins.ts` 注释、`adapters/config/schema.ts`）。

两条修复路线（二选一）：

- **路线 A（推荐）**：统一到 `nex-plugins-official`——改 `DEFAULT_ENABLED`
  集合、`mcp.ts`、UI 引用；CDN 路径要么自建分片，要么改回 `/zcode/` 路径作为过渡。
- **路线 B（快速止血）**：全部回退 `zcode-plugins-official` + `/zcode/` CDN 路径，
  恢复与官方 CDN 的兼容，后续再整体迁移。

## 3. 其它差异（小项）

| 项 | 产品 | Nex fork |
| --- | --- | --- |
| `config/default.json` | feedback → 智谱飞书表单、community → 飞书群 / Discord | **未改**，仍指 ZCode 渠道 |
| 遥测（@arms RUM、zcode.z.ai 埋点） | 有 | 已裁剪（见 CHANGELOG，不在本对比范围） |
| 账号 / 登录门禁 | 有 | 已裁剪 |
| `tools/`（bfs、ugrep、ripgrep 原生搜索） | 随包分发 | 构建链已备（`scripts/build-native-search-tools.mjs`），等价 |
| `macos-window-bounds` Swift helper | ✅ | ✅ 源码在 `packages/desktop/native/` |
| `apps/nex-cli/packages/cli/dist/zcode.cjs` | — | **残留物**（rename 前的 16MB 旧构建，与产品 zcode.cjs 不同），建议清理 |
| 品牌资源 / URL scheme / 数据目录 | `zcode://`、`~/.zcode` | 已改 `nex://`、`~/.nex`（含自动迁移） |

## 4. 建议动作（按优先级）

1. ~~**统一 marketplace id**（§2）~~ ✅ 已随「移除默认插件市场」完成。
2. **补插件 seed**：从产品 `glm/packages/` 提取内容型插件（注意许可证，见 §5），或自建
   市场仓库后由用户添加；`sea-official-plugin-assets.mjs` 的 `officialSeaPlugins` 与
   `official-plugin-definitions.ts` 的 `version`/`requiredSeedPaths` 需同步扩充。
3. **决定 remote runtime CDN**：`/nex/electron/releases/` 404——remote agent
   要么自托管该路径，要么禁用相关入口。
4. 清理 `superpowers-plugin` 空壳与 `cli/dist/zcode.cjs` 遗留。
5. 更新 `config/default.json` 的 feedback / community 指向自己的渠道。

## 5. 插件许可证备注（copy 前必读）

- 上游开源仓库（Apache-2.0）内的插件（browser-use、node-repl-host、bundled-skills）可自由使用
- 产品安装包 `glm/packages/` 内的插件**不在 Apache-2.0 授权范围内**：
  - documents / pdf / presentations / spreadsheets 四件套为**专有非商业许可**
    （`skills/*/LICENSE.txt`：仅限个人/教育/非商业，商用需书面许可，解释权归作者）——
    不得 copy 进本发行版；如需同类能力应基于公开标准格式自行实现
  - skill-creator / plugin-creator / nex-guide / android-emulator / ios-simulator 声明为 MIT，
    copy 时需补齐版权与许可声明并登记 THIRD-PARTY-NOTICES
  - image-search 为 Apache-2.0，但硬依赖 ZCode 控制面账号体系，fork 无可用后端
