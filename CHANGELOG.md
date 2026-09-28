# Changelog

Nex 的所有重要改动记录在本文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.0.2] - 2026-09-28

构建与发布：

- Gitea Actions：PR 检查流水线（linux-amd64 runner）
- GitHub Actions：PR 检查、macOS DMG 发布（Developer ID 签名 + 公证 + staple）、
  server/web Docker 镜像发布到 GHCR
- 桌面端自动更新切换为 GitHub Releases（electron-updater github provider）
- Gitea 仓库通过 push mirror 自动同步 main 与 tags 到 GitHub

Docker：

- 新增根 Dockerfile（server / web 双镜像）与 docker-compose.yml，compose 强制
  NEX_SERVER_AUTH_TOKEN 鉴权

修复：

- CLI 跨 workspace 依赖改用 link: 协议，pnpm install 恢复正常
- electron-builder 签名覆盖内嵌搜索工具（bfs/ripgrep/ugrep），修复公证被拒
- 桌面端更新为新版 DMG 安装器背景图

## [1.0.0] - 2026-09-27

基于 [ZCode](https://github.com/zai-org/ZCode) v3.14.3（Apache-2.0）的首次独立发行版本。

品牌与标识：

- 产品由 ZCode 更名为 **Nex**，桌面产品身份改为 `productName: Nex` / `appId: dev.nex.app`，Linux 可执行名 `nex`
- 全量改名运行时契约：34 个包 `@zcode/*` → `@nex/*`、环境变量 `ZCODE_*` → `NEX_*`（284 个）、
  URL scheme `zcode://` → `nex://`、preload 全局桥 `window.zcode` → `window.nex`、
  RPC channel 与协议字面量 `zcode-*` → `nex-*`
- CLI：`zcode` → `nex`（bin、进程名、SEA 产物）
- 全新图标母版落地：九档 PNG、macOS icns、Windows 多档 ico（含托盘）、Web favicon

数据迁移：

- 数据目录 `~/.zcode` → `~/.nex`：首次解析时自动原子改名迁移（含工作区级 `.zcode` 目录兼容）

精简与裁剪：

- 移除全部遥测出口：数仓埋点（zcode.z.ai）、阿里云 ARMS RUM、OTLP traces/metrics，
  并删除 `@arms/rum-electron` 与 7 个 `@opentelemetry/*` 依赖；编译期总开关关闭，
  任何环境下均不出网
- 移除 ZCode 账号体系：启动强制登录门禁、JWT 过期强制重登、头像菜单（语言/主题/界面模式
  移入设置页，升级/连接使用入口删除）、命令面板 login/logout 快捷命令
- 保留模型设置页的 provider 登录（OAuth）作为唯一登录路径
- 移除设置页「引导」（新手职业引导 + 迁移向导入口）与设置页右上角帮助入口
- 模型配置页移除智谱专门 section（预置供应商 / Coding Plan / Start Plan），
  添加供应商模板不再分组；Web 端开放工作区记忆详情查看

修复与优化：

- 主界面左下角 footer 精简为设置/返回按钮
- 新建对话背景字标由 Z 更换为 Nex「N」线框（浅色内联 SVG + 深色渐变资源）

已知保留项：

- 插件市场仍使用 `zcode-plugins-official` ID 与 z.ai CDN（后续单独处理）
- 模型 API / OAuth 端点仍指向智谱服务（`bigmodel.cn` / `api.z.ai` / `zcode.z.ai`）
- DMG 安装背景图沿用原版视觉

## [Unreleased]

### 移除默认插件市场

- 不再预置任何插件市场：`DEFAULT_PLUGIN_MARKETPLACES` 清空，商店页不再展示 ZCode 官方 CDN 源
  （该 CDN 无 nex 分片，路径 404）；添加市场源能力保留（git / GitHub / URL / 本地路径，兼容
  `.claude-plugin/marketplace.json` 格式）
- `ensureDefaultPluginMarketplaces` 迁移：存量安装 `known_marketplaces.json` 里残留的官方市场
  预置记录（`nex-plugins-official` 及改名前的 `zcode-plugins-official`）在读取时一并清除
- 移除商店页「目录自动刷新」（`officialMarketplaceAutoRefresh`）：该机制仅服务于已移除的官方 CDN 市场
- 官方插件 id 全面统一为 `@nex-plugins-official`：`DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS`、
  `NEX_CUA_OFFICIAL_PLUGIN_ID`、`CANONICAL_CUA_PLUGIN_ID`、UI 插件引用（推荐语/图标/内置技能 i18n）
  共 80 余处；旧 `zcode-plugins-official` id 保留为兼容别名，旧配置读取时自动归一
- 内置能力（node-repl-host、browser-use）不受影响：seed 机制与市场列表无关，仍在首启时本地 seed

（暂无）
