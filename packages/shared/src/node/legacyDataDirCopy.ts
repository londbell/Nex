import { cpSync, existsSync, lstatSync, renameSync, rmSync } from "node:fs";

/**
 * 二次开发：Nex 改名前的数据目录是 `.zcode`（用户级 `~/.zcode` 与工作区级 `<ws>/.zcode`）。
 *
 * 迁移策略是"复制"而不是"改名"：旧目录原样保留，仍在使用 ZCode 的用户或
 * 同一仓库里的其他协作者不受影响，Nex 只在新目录上读写。
 *
 * - 目标目录已存在或旧目录不存在时什么都不做；
 * - 先复制到同级临时目录，再原子 rename 到目标，避免中途失败留下半份 `.nex`
 *   从而永久挡住后续迁移；多进程并发时 rename 失败的一方清理自己的临时目录；
 * - 每个目标目录在进程内只检查一次，调用方可以放在高频路径上；
 * - 同步 IO：调用方是同步路径 getter，且复制只在首次升级时发生一次。
 */

export type LegacyDataDirCopyResult =
  | { readonly status: "skipped" }
  | { readonly status: "copied" }
  | { readonly status: "failed"; readonly error: unknown };

const checkedTargets = new Set<string>();

/** 只复制目录、普通文件和符号链接；socket / FIFO 等特殊文件无法复制也没有迁移意义。 */
function isCopyableEntry(source: string): boolean {
  try {
    const stat = lstatSync(source);
    return stat.isDirectory() || stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function removeQuietly(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // 临时目录清理失败只会留下带 .migrating- 后缀的残留，不影响正确性。
  }
}

export function copyLegacyDataDirOnce(
  targetDir: string,
  legacyDir: string,
): LegacyDataDirCopyResult {
  if (checkedTargets.has(targetDir)) return { status: "skipped" };
  checkedTargets.add(targetDir);
  if (existsSync(targetDir) || !existsSync(legacyDir)) return { status: "skipped" };

  const stagingDir = `${targetDir}.migrating-${process.pid}-${Date.now()}`;
  try {
    cpSync(legacyDir, stagingDir, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
      filter: isCopyableEntry,
    });
    try {
      renameSync(stagingDir, targetDir);
    } catch (error) {
      // 另一个进程已先完成迁移：以对方结果为准。
      if (existsSync(targetDir)) {
        removeQuietly(stagingDir);
        return { status: "skipped" };
      }
      throw error;
    }
    return { status: "copied" };
  } catch (error) {
    removeQuietly(stagingDir);
    return { status: "failed", error };
  }
}

/** 仅供测试：清除进程内"已检查"记录。 */
export function resetLegacyDataDirCopyStateForTests(): void {
  checkedTargets.clear();
}
