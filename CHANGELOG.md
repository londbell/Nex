# Changelog

Nex 的所有重要改动记录在本文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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

（暂无）
