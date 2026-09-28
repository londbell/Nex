# Changelog

All notable changes to Nex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Removed the default plugin marketplace

- No marketplace is preset anymore: `DEFAULT_PLUGIN_MARKETPLACES` is emptied and
  the store no longer shows the ZCode official CDN source (the CDN has no
  `/nex/` shard; the path 404s). Adding marketplace sources is preserved
  (git / GitHub / URL / local path, `.claude-plugin/marketplace.json` compatible)
- Migration in `ensureDefaultPluginMarketplaces`: leftover preset official
  marketplace records (`nex-plugins-official` and the pre-rename
  `zcode-plugins-official`) in `known_marketplaces.json` are dropped on read
- Removed the store catalog auto-refresh (`officialMarketplaceAutoRefresh`);
  it only served the removed official CDN marketplace
- Official plugin ids unified to `@nex-plugins-official` across
  `DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS`, `NEX_CUA_OFFICIAL_PLUGIN_ID`,
  `CANONICAL_CUA_PLUGIN_ID`, and UI references (suggested prompts / icons /
  builtin skill i18n), ~80 sites total; legacy `zcode-plugins-official` ids
  remain as compatibility aliases and are canonicalized on read
- Bundled capabilities (node-repl-host, browser-use) are unaffected: local
  seeding is independent of the marketplace list

## [1.0.2] - 2026-09-28

Build and release:

- Gitea Actions: PR check pipeline (linux-amd64 runner)
- GitHub Actions: PR checks, macOS DMG release (Developer ID signing +
  notarization + staple), server/web Docker images published to GHCR
- Desktop auto-update switched to GitHub Releases (electron-updater GitHub provider)
- The Gitea repository mirrors main and tags to GitHub via push mirror

Docker:

- Added the root Dockerfile (server / web images) and docker-compose.yml;
  compose enforces `NEX_SERVER_AUTH_TOKEN` authentication

Fixes:

- CLI cross-workspace dependencies switched to the `link:` protocol, restoring `pnpm install`
- electron-builder signing now covers the embedded search tools (bfs/ripgrep/ugrep),
  fixing notarization rejections
- Desktop updater adopts the new DMG installer background artwork

## [1.0.0] - 2026-09-27

First standalone release, based on [ZCode](https://github.com/zai-org/ZCode)
v3.14.3 (Apache-2.0).

Branding and identity:

- Product renamed from ZCode to **Nex**: desktop identity is now
  `productName: Nex` / `appId: dev.nex.app`, Linux executable name `nex`
- Runtime contracts renamed across the board: 34 packages `@zcode/*` → `@nex/*`,
  environment variables `ZCODE_*` → `NEX_*` (284 occurrences), URL scheme
  `zcode://` → `nex://`, preload bridge `window.zcode` → `window.nex`,
  RPC channels and protocol literals `zcode-*` → `nex-*`
- CLI: `zcode` → `nex` (bin, process name, SEA artifact)
- New icon master set: nine PNG sizes, macOS icns, multi-size Windows ico
  (including tray), web favicon

Data migration:

- Data directory `~/.zcode` → `~/.nex`: automatic atomic rename migration on
  first resolution (workspace-level `.zcode` directories remain compatible)

Trimmed and removed:

- Removed all telemetry egress: warehouse analytics (zcode.z.ai), Alibaba Cloud
  ARMS RUM, OTLP traces/metrics; deleted `@arms/rum-electron` and seven
  `@opentelemetry/*` dependencies; compile-time master switch off — no outbound
  calls in any environment
- Removed the ZCode account system: forced login gate on startup, forced
  re-login on JWT expiry, avatar menu (language/theme/UI mode moved to Settings;
  upgrade/connect entries removed), command-palette login/logout commands
- Provider login (OAuth) in the model settings page remains the only login path
- Removed the Settings onboarding pages (career onboarding + migration wizard
  entry) and the top-right help entry
- Removed the Zhipu-specific section from the model config page (preset
  providers / Coding Plan / Start Plan); provider templates are no longer
  grouped; the web client gained workspace memory detail view

Fixes and polish:

- Simplified the main-window footer to settings/back buttons
- Replaced the new-conversation background watermark "Z" with the Nex "N"
  outline (light inline SVG + dark gradient assets)

Known leftovers:

- The plugin marketplace still uses the `zcode-plugins-official` id and the
  z.ai CDN (addressed separately later — resolved in Unreleased)
- Model API / OAuth endpoints still point at Zhipu services
  (`bigmodel.cn` / `api.z.ai` / `zcode.z.ai`)
- The DMG installer background retains the original artwork
