import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyLegacyDataDirOnce, resetLegacyDataDirCopyStateForTests } from "@nex/shared/node";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "nex-legacy-copy-"));
  resetLegacyDataDirCopyStateForTests();
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("copies the legacy dir and keeps the original in place", () =>
  withTempDir(async (dir) => {
    const legacy = join(dir, ".zcode");
    await mkdir(join(legacy, "v2"), { recursive: true });
    await writeFile(join(legacy, "v2", "setting.json"), "{}");
    await symlink("v2/setting.json", join(legacy, "link.json"));

    assert.equal(copyLegacyDataDirOnce(join(dir, ".nex"), legacy).status, "copied");
    assert.equal(await readFile(join(dir, ".nex", "v2", "setting.json"), "utf8"), "{}");
    assert.equal(await readFile(join(dir, ".nex", "link.json"), "utf8"), "{}");
    assert.equal(await readFile(join(legacy, "v2", "setting.json"), "utf8"), "{}");
    // 不残留临时目录。
    assert.deepEqual((await readdir(dir)).sort(), [".nex", ".zcode"]);
  }));

test("never touches an existing target and only checks once per target", () =>
  withTempDir(async (dir) => {
    const legacy = join(dir, ".zcode");
    const target = join(dir, ".nex");
    await mkdir(legacy);
    await writeFile(join(legacy, "a.txt"), "legacy");
    await mkdir(target);

    assert.equal(copyLegacyDataDirOnce(target, legacy).status, "skipped");
    assert.deepEqual(await readdir(target), []);

    await rm(target, { recursive: true });
    // 同一进程内已检查过，不会再复制。
    assert.equal(copyLegacyDataDirOnce(target, legacy).status, "skipped");
  }));

test("skips when there is no legacy dir", () =>
  withTempDir(async (dir) => {
    assert.equal(copyLegacyDataDirOnce(join(dir, ".nex"), join(dir, ".zcode")).status, "skipped");
    assert.deepEqual(await readdir(dir), []);
  }));
