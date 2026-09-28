# Computer Use 产品实现分析（逆向参考）

> 状态：参考文档（非 spec）。记录对象是 ZCode 官方发布产物
> `ZCode.app 3.14.3`（arm64）中 Computer Use 的真实实现，用于指导本仓库
> fail-closed 占位实现的补全。分析日期：2026-09-28。
>
> 本仓库（`@nex/nex-cua`）发布的是 **API 兼容占位包**：所有运行时表面报
> unavailable 并 fail-closed。真实实现只随官方产品分发。本文所有结论来自
> 对发布产物的静态取证：解包 `app.asar`、按 Node SEA 格式从 Helper 二进制
> 提取内嵌 JS、`nm`/`otool`/字符串分析 `ax_native.node`。未做动态调试。

## 1. 发布产物解剖

```
ZCode.app/Contents/Resources/
├── glm/zcode.cjs                              # 14MB，agent CLI 打包
├── glm/packages/zcode-cua-plugin/             # ★ CUA SDK + skill + 文档
│   ├── scripts/computer-use-client.mjs        # 1208 行，模型可见 SDK
│   ├── skills/computer-use/SKILL.md           # 模型操作手册
│   └── docs/computer-use.md                   # 按需加载的完整参考
├── glm/packages/node-repl-host/dist/mcp/server.js
│                                              # 4.8MB，含真实 staging runtime
├── app.asar                                   # 327MB Electron 壳
└── cua-helper/ZCode Computer Use.app/
    ├── Contents/MacOS/ZCode Computer Use      # 107MB Node SEA 单文件可执行
    └── Contents/Resources/
        ├── ax_native.node                     # 964K ObjC++/C++ native addon
        └── node_modules/{sharp,...}           # 16MB 图像处理
```

- Helper：Node **SEA**（`NODE_SEA_BLOB` fuse 置位）。SEA asset 位于二进制
  offset `0x0513c000`，大小 17,089,920 字节，是 esbuild 打包的
  `@zcode/zcode-cua` 全量源码，**未混淆且保留注释**（含真机 bug 复盘）。
  提取方法：`dd` 该区间到本地文件即可阅读。
- Helper bundle id：`dev.zcode.cua-helper`，`LSUIElement`，版本与构建号在
  Info.plist（`ZCodeCUAHelperBuildId = pipeline-293504-ab4d5e6b`）。
- 版本对齐：`@zcode/zcode-cua-plugin@0.6.3` 与本仓库占位包
  `@nex/nex-cua@0.6.3` 同版本号——"同版本合同、双实现"。

## 2. 端到端链路

```
模型 cell (mcp__node_repl__js)
  └─ setupComputerUseRuntime()      ← 动态 import ZCODE_CUA_PLUGIN_ROOT 下 SDK
      └─ bridge.call(method)        ← Symbol.for("zcode.node-repl.computer-use-bridge")
          └─ node-repl CUA broker   ← token + timingSafeEqual（本仓库已有）
              └─ staging runtime    ← server.js 内：state_id/frame_id 登记、
              │                        ActionTier、settleObservation、14 工具分发
                  └─ BrokerClient → Unix socket /tmp/zcode-cua-$UID/broker.sock
                      │                （Windows: named pipe zcode-cua-helper-*）
                      └─ Helper broker server（43 个原生方法）
                          └─ ax_native.node（AXUIElement / CGEvent / SCKit）
```

关键装配点（本仓库对应位置）：

| 环节 | 产品 | 本仓库 |
| --- | --- | --- |
| runtime 探测 | `ZCODE_CUA_PERMISSION_BROKER_SOCKET` 存在即创建真实 runtime（node-repl-host `server.js`） | `packages/nex-cua` 占位恒返回 undefined |
| socket 路径 | `/tmp/zcode-cua-$UID/broker.sock`（`XDG_RUNTIME_DIR` 优先；Win 走 named pipe） | 合同已定义（`.d.ts`） |
| env 注入 | `ZCODE_CUA_PERMISSION_BROKER_SOCKET/REFRESH_MARKER/TOKEN` | `services/node.ts` 装配代码已备好 |
| Helper 安装 | 内置 `Resources/cua-helper`，支持 `ZCODE_CUA_HELPER_DOWNLOAD_BASE_URL` 下载回退 | `desktopCuaHelperInstaller.ts` 已实现（指向占位工厂） |

**双向认证**：连接带随机 token 之外，Helper 的 `peerVerifier` 用 macOS
audit token 校验对端进程**及其父进程**均为 ZCode Team 签名；launch 时
`--launcher-pid` 不验签则 `process.exit(2)`。

## 3. SDK 层（zcode-cua-plugin）

设计基线在源码头部写明：**"模型可见面与 Codex 的 `cua` 逐字同构"**（逆向
基线 `@oai/cua@0.2.4`），三原则：

- **R1 同名同签**：`getApp/getAXState/click/pressKey/setValue/...` 与 Codex
  逐字一致；`Target` 附加可枚举成员数为 0。
- **R2 只加不减**：附加能力只出现在选项键或 `cua.computer` 逃逸口（14 个
  底层工具，入参 schema 逐字保留）。
- **R3 安全语义只藏不删**：state_id 强校验、frame 精确栅格、possibly_sent
  防重放、controller lease、kill switch 全保留，改为内部字段或类型化错误。

值得复刻的工程决策（均有真机 bug 复盘注释）：

1. **绑定身份收敛**：`getApp("地图")` 后把 app_ref 收敛成观察返回的
   `{pid, bundle_id}`，消除"观察路径宽容、键盘路径严格"的分叉。
2. **diff 基线纪律**：Helper 的基线是"上次 capture"而模型可能没见过那棵树。
   SDK 用 `tree_shown_to_model` 标志 + `treeSeen` 清除，强制"delta 只相对
   模型看过的树"；`getScreenshot`/`elements()` 这类静默观察不算基线。
3. **冷启动信封**：Helper 懒启动时返回非 error 的
   `{kind:"CUA_NOT_READY", reasonCode, retryable}`；SDK 按 250ms~1.5s 退避
   重试同一调用，但 **`possibly_sent` 的动作绝不重放**。
4. **错误契约**：动作失败抛 `ComputerUseError{code, actionSent, retry}`，
   retry ∈ `reobserve/retry/never`——比 Codex 的 `Promise<void>` 多携带
   "可能已下发"信息。
5. **展示投影**：观察结果自带展示（对齐 Codex）；`projectToHost` 把
   structuredContent 里的**元素全表剥掉**（换 `element_count`），防止
   140KB+ 的 AX 树经宿主展示面板泄漏进上下文；单 raster 规则由架构保证。
6. **getApp 不展示状态**：node_repl 每个 cell 都是全新 Worker，绑定不跨
   cell；照抄 Codex 的"绑定即展示"会在每个 cell 吐一棵作废的树。

## 4. Helper broker（SEA 内嵌 JS）

**方法面（43 个）**：诊断（`broker_info/controller_status/controller_takeover/
request_access/permission_status/screen_capture_*/supports_accessibility`）、
观测（`list_applications/application_info/list_windows/capture_app/
element_at_point/read_element`）、动作（`click/scroll/drag/type_text*/
press_key*/hold_key*/cancel_input_holds/element_*/paste`）、焦点门
（`prevent_activation/reenable_activation/is_focus_steal_prevented`）、
PiP（`pip_*/pip_session_*`）。

**模型工具投影**：14 个（`list_apps/list_windows/get_app_state/left_click/
scroll/left_click_drag/type/set_value/select_text/key/perform_action/paste/
request_access/stop_computer_control`）。注意：
- `open_application` 已**整体删除**——启动与激活并入 `get_app_state` 的
  透明拉起（background launch）。
- ActionTier 分级：`READ_ONLY`（4 个观测）/`T1_INPUT`/`SAFETY_CONTROL`（stop）。
- `request_access` 是**纯状态快照**（`prompt=false`），绝不触发 TCC 弹窗；
  所有权限请求手势只属于可信 Host UI。

**staging runtime**（node-repl-host 侧）持有：
- `state_id` LRU 注册表（tombstone 防重放）
- `FrameRegistry`：frame_id 签发、过期、tombstone、恢复文案
- `settleObservation`：动作后等 UI settle——300ms 快路径抓一次，树没变则
  1s 递增、5s 封顶；模型自发的观察不额外等待

**安全机制**：

| 机制 | 实现 |
| --- | --- |
| controller lease | `controller-lease.json` + reclaim lock；owner 记 pid + `ps lstart` 进程身份 + app 身份；文件权限逐项检查（0700/非 symlink/uid 匹配/8KB 上限）。第二个会话 `CONTROLLER_BUSY`（never-retry） |
| 只读白名单 | `READ_ONLY_BROKER_METHODS` 不参与 controller 仲裁，只读共存 |
| 帧合同 | 坐标动作带 `frame_provenance`：投影点一致、未过期、display topology fingerprint 未变、live pixel owner 未变、`app_ref` 与帧 owner 匹配，任一不满足 `action_sent=false` fail-closed |
| capture epoch | 元素索引观察时冻结为 native token，ack/release 生命周期管理，过期即 `element_unavailable` |
| 只读探测 | `screen_capture_probe` 抓小图确认 WindowServer 放行像素，软超时不拖 readiness |
| runtime 目录私有性 | 0700、非 symlink、uid 匹配，否则 `blocked` |

## 5. ax_native.node（native 层逆向）

964KB arm64 Mach-O bundle，C++/ObjC++ 混编，node-addon-api (NAPI)，
1051 个函数（绝大多数在匿名命名空间，`Init` 导出约 60 个）。

### 依赖

| 框架 | 用途 |
| --- | --- |
| Cocoa / AppKit | NSPanel、NSPasteboard、NSRunningApplication、NSWorkspace、NSBitmapImageRep |
| ApplicationServices / CoreGraphics | AXUIElement 全家桶、CGEvent、CGWindowList |
| ScreenCaptureKit（weak link） | SCShareableContent / SCScreenshotManager / SCStream |
| CoreMedia / CoreVideo / ImageIO | CMSampleBuffer 帧、PNG 编解码 |
| QuartzCore | CALayer/CAAnimation（PiP 镜像 + ghost 动画） |
| Security | SecCode 系列（对端签名校验） |
| **SkyLight（私有）** | `SLEventPostToPid / SLPSPostEventRecordTo / SLSGetWindowEventMask / SLSMainConnectionID` —— 背景输入底层通道 |

### 子系统

1. **AX 引擎**：`AXUIElementCreateSystemWide/Application`，递归抓树，
   `AXUIElementSetMessagingTimeout` 防 AX 卡死。**Electron 专项**：设置
   `AXManualAccessibility` + `AXEnhancedUserInterface` 强制 Chromium 暴露
   AX 树。命中测试走 `AXUIElementCopyElementAtPosition`。
2. **元素引用**：元素带不透明 `ref`，JS 原样传回 `readElement(ref)` 等；
   配合 capture epoch ack/release 失效机制。
3. **截图管线（三级降级 + 背压）**：SCScreenshotManager verified capture
   （前后比对 windowId/ownerPid/bundleId/bounds，防 TOCTOU）→ one-shot
   SCStream（`ZCodeOneShotStreamOutput`，带帧预算）→ `CGWindowListCreateImage`
   legacy（带预算）。背压字段 `_captureInFlight/_outstandingCaptures/
   _captureBackpressureShown`；每 pid 独立互斥锁。`inspectPngContent` 纯
   native 解码采样做 blank 检测（64×64 网格/可见像素率/色彩桶）。
4. **输入合成**：
   - 全局：CGEvent 标准合成（click/scroll/drag/hold）。
   - 背景（不抢焦点）：`CGEventPostToPid` + **SkyLight 私有 API**；
     `SLSGetWindowEventMask` 先确认目标窗口真的接受事件，否则
     `skylight_unavailable` fail-closed（不降级到抢焦点路径）。
     `begin/endBackgroundWindowInput(Detailed)` 会话协议包住键序。
   - 键值映射：`UCKeyTranslate`（当前键盘布局，处理死键）；unicode 文本用
     `CGEventKeyboardSetUnicodeString`；hold key 带 sessionKey 可按 cell 取消。
   - **preventActivation 门**：置位后所有全局 CGEvent 合成被 native 直接
     拒绝，强制 AX 元素路径；broker 在 action 批次前后包住。
   - 干扰检测：`CGEventSourceButtonState/FlagsState`、`CGEventTapCreate`。
5. **应用生命周期**：`activateApplication/activateWindow/
   terminateApplicationVerified` 全部带 `expectedBundleId`，native 先验证再
   执行；`openApplicationInBackground` 走 NSWorkspace completion 拿即时 pid。
6. **原子粘贴**：`pasteboardBeginProvidedPaste` → 自定义
   `ZCodeCuaPasteDataProvider`（惰性提供数据）→ `AwaitProvidedRead` →
   `MarkDispatched` → `Finish`。取代宿主侧"存→写→发键→还原"四步拼装。
7. **PiP 画中画**：`ZcPipController`（NSPanel）+ SCStream 持续镜像单窗口；
   窗口堆栈（cap 后逐出最旧非 lead）；**反反馈回路**（截图时
   `hideCaptureUntilNextFrame`）；交互机制（synthetic pointer-down 预约、
   所有权采样、可见性 epoch、双击激活评估）；`CuaCopyWindowAcceptsLeftMouseDown`
   查窗口事件掩码；验证启动 worker；6 种 `PipSimulate*` 测试注入钩子。
8. **Ghost cursor**：覆盖层窗口 + `ghostRenderPng`/`ghostClickRipple`
   （NSBezierPath/CAShapeLayer）+ 控制器状态条。
9. **身份原语**：`getPeerCredentials`（pid + audit token）、
   `verifyProcessCodeSignature(WithAuditToken)`（SecCodeCopyGuestWithAttributes
   + SecRequirementCreateWithString + SecCodeCheckValidity）、
   `responsibleProcessPid`（穿透 LaunchServices 代理）。
10. **TCC**：`AXIsProcessTrustedWithOptions` + 实际 AX 探测（warm/check）；
    `CGPreflightScreenCaptureAccess/CGRequestScreenCaptureAccess`；
    **直接 SQLite 查 TCC.db**（`SELECT auth_value FROM access WHERE
    service=?1 AND client=?2 AND auth_value=2`）作为第二信源——解 AX 信任
    缓存 staleness（对应 JS 侧 "stale" 状态）。

### 线程模型

NAPI AsyncWorker（capture/icon/open-app/PiP 启动）不占 JS 线程；所有 UI
"must run on main"；每 pid capture 串行化。

### 安全不变量

1. 一切动作先验证身份（pid + bundleId）再执行。
2. 私有 API 不可用一律 fail-closed，不降级。
3. 能力按 argv 门控（`--background/--ghost-cursor-overlay/--pip/--launcher-pid`）。
4. addon 零第三方依赖（PNG 自绘自解），无供应链面。

## 6. 本仓库差距清单

### 已有（开源仓库完整实现，直接复用）

| 层 | 组件 |
| --- | --- |
| 协议合同 | `packages/nex-cua/*.d.ts` 全部类型 + shared 常量（与产品逐字对齐） |
| 执行宿主 | cell 级 CUA broker（token/限额）、bridge 注入、subagent 禁用、`_meta` app 身份一跳、`setupComputerUseRuntime` 锚点事件 |
| Agent core | 官方 MCP 投影 + authority 门、帧合同校验/截断保护、子代理策略、工具风险分级 |
| 服务层 | 权限服务 descriptor、PiP 会话服务（turn-started 补发）、Helper 生命周期装配、Windows runtime 解析链 |
| Desktop | Helper 安装器包装、权限面板/IPC、设置 watcher、PiP IPC/焦点路由、Windows 操作浮层 |
| UI | 26 个工具的渲染、权限状态 store、composer 入口、中英文案 |

### 缺失（需要实现，按产品对应件）

| # | 组件 | 难度 | 参考 |
| --- | --- | --- | --- |
| 1 | 真实 CUA runtime（staging runtime：state/frame 注册、settleObservation、NOT_READY 退避、14 工具分发） | 高 | node-repl-host `server.js`（压缩）+ 本文 §4 |
| 2 | Helper broker server（socket、43 方法、只读白名单、refresh marker） | 高 | SEA 提取的 `helper.cjs`（未混淆、注释齐全） |
| 3 | Controller lease/协调器 | 中 | 同上 |
| 4 | Peer/launcher 双向认证 | 中 | §5.9 |
| 5 | `ax_native.node`（macOS native 层） | **极高** | §5；最小版 = AX 树 + 前台截图 + 前台 CGEvent 键鼠 |
| 6 | AX 树管线（normalize/diff/裁剪/token 冻结） | 中高 | `helper.cjs` 内 `axSnapshot.js`/`treeNormalization.js` |
| 7 | Helper 打包与签名（Node SEA、Developer ID、LaunchServices 权限请求） | 中 | — |
| 8 | 模型 SDK + skill（`computer-use-client.mjs` + SKILL.md + docs） | 高 | §3 |
| 9 | Windows native 面（UIA/捕获/剪贴板） | 高（可延后） | — |
| 10 | Linux native 面（AT-SPI/ibus） | 高（可延后） | — |
| 11 | PiP Helper 侧通道 | 中（可延后） | 宿主侧已备好；可先降级为 Windows 式指示浮层 |

### 分阶段最小路径

| 阶段 | 内容 | 结果 |
| --- | --- | --- |
| P0 | #2 + #5 最小版 + #1 裁剪版（去 frame registry，坐标禁用只走元素索引）+ #7 签名 | macOS 前台可用，accessibility-first 完整 |
| P1 | #6 完整管线 + #3 lease + #8 SDK | 背景可观察、前台可操作 |
| P2 | #5 完整版（背景键盘/原子 paste/verified capture）+ 帧合同 + 坐标路径 | 安全性对齐产品 |
| P3 | #11 PiP/ghost、#9/#10 跨平台 | 完整对齐 |

关键杠杆：Helper 的 17MB JS bundle 未混淆且保留全部注释（SEA asset
offset `0x0513c000`），上表 #1/#2/#3/#6/#8 都有完整参考实现；真正要从零
写的是 #5 的 native 层与签名基础设施。
