import { existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let migrated = false;

/**
 * 二次开发数据迁移：Nex 改名前数据目录为 `~/.zcode`。
 * 首次解析 `~/.nex` 时若其不存在而旧目录存在，则整体原子改名迁移（同盘 rename，零拷贝）。
 * 幂等：迁移完成后写入 .zcode-migrated 不再重复处理（rename 本身已保证目录消失）。
 */
export function migrateLegacyNexHome(): void {
  if (migrated) return;
  migrated = true;
  try {
    const nexHome = join(homedir(), ".nex");
    const legacyHome = join(homedir(), ".zcode");
    if (existsSync(nexHome) || !existsSync(legacyHome)) return;
    renameSync(legacyHome, nexHome);
  } catch {
    // 迁移失败不阻塞启动：新目录会按全新数据初始化，旧目录保留在原地。
  }
}

/** 工作区级遗留目录迁移（.zcode/agents、.zcode/plans 等）：workspaceRoot 下 .nex 不存在而 .zcode 存在时改名。 */
export function migrateLegacyNexWorkspaceDir(workspaceRoot: string): void {
  try {
    const nexDir = join(workspaceRoot, ".nex");
    const legacyDir = join(workspaceRoot, ".zcode");
    if (existsSync(nexDir) || !existsSync(legacyDir)) return;
    renameSync(legacyDir, nexDir);
  } catch {
    // 同上：失败不阻塞，按新目录初始化。
  }
}
