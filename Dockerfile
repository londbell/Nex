# syntax=docker/dockerfile:1
# Nex server + web 镜像（无 Electron）。
#   server：Node 运行 packages/server（HTTP/WS），agent 子进程由 monorepo 内
#           apps/nex-cli/packages/cli/dist/nex.cjs 提供（findUpward 命中）。
#   web：   nginx 托管 packages/web/dist，并把 /api、/ws 反代到 server。

FROM node:24-bookworm AS builder
WORKDIR /app

# 不需要 Electron 二进制；husky 在无 .git 的构建上下文里要关掉。
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    HUSKY=0 \
    NEX_ENV=production \
    NODE_OPTIONS=--max-old-space-size=4096

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# 先拷 lockfile 利用层缓存（link: 依赖指向根 packages，路径必须在拷贝后一致）。
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/nex-cli/pnpm-lock.yaml apps/nex-cli/pnpm-workspace.yaml apps/nex-cli/package.json apps/nex-cli/
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --dir apps/nex-cli install --frozen-lockfile

# CLI（agent 运行时）→ server（HTTP 入口）→ web（静态资源）。
RUN pnpm --dir apps/nex-cli run build
RUN pnpm --filter @nex/server build
RUN pnpm --filter @nex/web build

# ---- server 运行时 ----
FROM node:24-bookworm-slim AS server

# git：工作区/检查点功能；openssh-client：SSH 远程工作区（可选链路）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app /app

ENV NODE_ENV=production \
    NEX_ENV=production \
    PORT=3030 \
    NEX_SERVER_HOST=0.0.0.0 \
    NEX_DATA_BASE_DIR=/data \
    NEX_SERVER_WORKSPACE=/workspace

VOLUME ["/data", "/workspace"]
EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3030/api/server-info').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/entry-http.js"]

# ---- web 静态站点 ----
FROM nginx:1.27-alpine AS web

COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY docker/web-nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
