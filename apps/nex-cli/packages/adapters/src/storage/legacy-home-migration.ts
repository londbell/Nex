import { homedir } from "node:os";
import { join } from "node:path";
import { copyLegacyDataDirOnce } from "@nex/shared/node";

/**
 * 二次开发数据迁移：Nex 改名前数据目录为 `~/.zcode`。
 * 首次解析 `~/.nex` 时若其不存在而旧目录存在，则复制一份（旧目录保留，ZCode 仍可继续使用）。
 * 失败不阻塞启动：新目录按全新数据初始化。
 */
export function migrateLegacyNexHome(): void {
  copyLegacyDataDirOnce(join(homedir(), ".nex"), join(homedir(), ".zcode"));
}
