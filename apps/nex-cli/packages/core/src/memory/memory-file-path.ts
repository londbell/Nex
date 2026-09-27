import { existsSync, renameSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { resolveWorkspacePath } from "../tool/path-policy.js";

function resolveWorkspaceNexDir(workspaceRoot: string): string {
  // 二次开发：兼容改名前的工作区级 .zcode 目录（存在 .nex 则不动，否则尝试改名）。
  const nexDir = join(workspaceRoot, ".nex");
  const legacyDir = join(workspaceRoot, ".zcode");
  try {
    if (!existsSync(nexDir) && existsSync(legacyDir)) renameSync(legacyDir, nexDir);
  } catch {
    // 迁移失败按新目录处理。
  }
  return nexDir;
}

const SENSITIVE_MEMORY_PATH_SEGMENTS = new Set([
  ".git",
  "hooks",
  ".husky",
  ".githooks",
  "node_modules",
  ".vscode",
  ".idea",
  "head",
  "config",
  "objects",
  "refs",
  ".nex",
  "skills",
  "commands",
  "agents",
  ".cargo",
  ".devcontainer",
  ".yarn",
  ".mvn",
]);

export function resolveContainedMemoryFilePath(input: {
  filePath: string;
  rootDir: string;
  workingDirectory: string;
  workspaceRoot: string;
}): string | undefined {
  const resolvedPath = resolveWorkspacePath({
    inputPath: input.filePath,
    operation: "write",
    workingDirectory: input.workingDirectory,
    workspaceRoot: input.workspaceRoot,
  });
  const relativePath = relative(input.rootDir, resolvedPath);
  return isContainedRelativePath(relativePath) ? resolvedPath : undefined;
}

export function resolveSafeMemoryFilePath(input: {
  filePath: string;
  rootDir: string;
  workingDirectory: string;
  workspaceRoot: string;
}): string | undefined {
  const resolvedPath = resolveContainedMemoryFilePath(input);
  if (!resolvedPath) return undefined;
  const relativePath = memoryFileRelativePath(input.rootDir, resolvedPath);
  return relativePath && !containsSensitiveMemoryPathSegment(relativePath)
    ? resolvedPath
    : undefined;
}

export function memoryFileRelativePath(rootDir: string, filePath: string): string | undefined {
  const relativePath = relative(rootDir, filePath);
  return isContainedRelativePath(relativePath) ? relativePath : undefined;
}

function containsSensitiveMemoryPathSegment(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/u)
    .some((segment) => SENSITIVE_MEMORY_PATH_SEGMENTS.has(normalizeSensitiveSegment(segment)));
}

function isContainedRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith("../") &&
    !relativePath.startsWith("..\\") &&
    !isAbsolute(relativePath)
  );
}

function normalizeSensitiveSegment(segment: string): string {
  const withoutControls = segment
    .toLowerCase()
    .replace(/[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/gu, "");
  return (withoutControls.split(":", 1)[0] ?? "").replace(/[. ]+$/u, "");
}
