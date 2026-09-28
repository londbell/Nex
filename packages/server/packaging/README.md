# Nex server 单二进制（SEA）

`node scripts/build-sea.mjs` 产出自包含的 Node 单可执行文件（SEA, Single Executable
Application），内嵌完整的 agent 运行时（`nex.cjs` + playwright/koffi/官方插件/bundled
skills/runtime tools，与 CLI SEA 复用同一套资产收集器与释放机制）。

## 产物

| 文件 | 平台 |
| --- | --- |
| `dist/sea/nex-server-darwin-arm64` | macOS Apple Silicon |
| `dist/sea/nex-server-linux-x64` | Linux x86_64 |
| `dist/sea/nex-server-linux-arm64` | Linux arm64 |

一个二进制两种角色（`src/seaEntry.ts`）：

```bash
./nex-server            # HTTP server（默认，等价于 node dist/entry-http.js）
NEX_SEA_AGENT_ROLE=1 ./nex-server app-server --stdio   # agent 角色（server 自己 spawn）
```

server 启动时把内嵌的 `nex.cjs` 释放到 `$NEX_DATA_BASE_DIR/sea-agent/<指纹>/`
（无数据目录时退回用户缓存：`~/Library/Caches/nex/sea-agent`、`~/.cache/nex/sea-agent`），
并通过 `NEX_AGENT_SERVER_COMMAND` env 把 agent 命令指回二进制自身。

## 构建

```bash
# 0) 依赖就绪：workspace 包 dist（typecheck 生成）+ agent bundle
pnpm typecheck
pnpm -r --filter "@nex/cli..." build

# 1) 构建（host 平台冒烟会自动跑：HTTP 角色起服务 + agent 角色 --version）
node scripts/build-sea.mjs                     # 三个平台全量
node scripts/build-sea.mjs --target linux-x64  # 单平台（交叉构建免 node 下载）

# 本机 Node 版本必须与 third-party/runtime/sources.json 登记的 license 条目一致
# （当前锚定 24.14.0，见 apps/nex-cli engines）。不一致时显式提供：
node scripts/build-sea.mjs --node-binary darwin-arm64=/path/to/node-v24.14.0/bin/node
```

## 安装为系统服务

见 `packaging/`：`install.sh`（支持 `--uninstall`）+ `nex-server.service`（systemd）+
`com.nex.server.plist`（launchd）。安装后 token 在 Linux
`/etc/nex-server/env`、macOS `~/.nex/server-data/env`。

```bash
sudo ./packaging/install.sh --binary ./dist/sea/nex-server-linux-x64
```
