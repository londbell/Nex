import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  onboardingDecisionSchema,
  onboardingRecordEntrySchema,
  onboardingRecordFileSchema,
} from "@nex/shared";
import type {
  OnboardingRecordEntry,
  OnboardingRecordEntryInput,
  OnboardingRecordFile,
} from "@nex/shared";
import { atomicWriteText } from "../fs/atomicFileUtils.js";
import { getAppConfigDir } from "../paths.js";
import { createServiceLogger } from "../logger/serviceLogger.js";
import type { IOnboardingRecordService } from "./onboardingRecord.js";

const logger = createServiceLogger("onboardingRecordService");

function getRecordFile(): string {
  // 记录是设备级数据，必须跟随 dataBaseDir（用户自定义数据目录时落在其 .nex/v2 下，
  // 与 telemetry-state.json 一致），不能学 setting.json 固定写 home——setting.json 留在 home
  // 只是启动引导需要固定位置读取 dataBaseDir，不代表其他设备数据的落点。
  return join(getAppConfigDir(), "onboarding-record.json");
}

/**
 * 读取记录文件；文件不存在返回 null，内容损坏（手改/写坏）时同样返回 null 并 warn——
 * 损坏文件等价于"从未记录"，重新触发引导后在下次 append 时重建。
 */
async function readRecordFile(filePath: string): Promise<OnboardingRecordFile | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return null;
    logger.warn(undefined, "read onboarding record failed:", err);
    return null;
  }
  try {
    return onboardingRecordFileSchema.parse(JSON.parse(raw));
  } catch (cause) {
    logger.warn(undefined, "invalid onboarding record json, treating as missing. error:", cause);
    return null;
  }
}

// Nex 没有账号体系，记录固定归属匿名身份（userId=null），与旧文件格式兼容。
const userId = null;

export function createOnboardingRecordService(): IOnboardingRecordService {
  // 串行化写：引导保存与并发触发判定同时发生时不丢条目。
  let writeQueue: Promise<unknown> = Promise.resolve();
  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const queued = writeQueue.then(task, task) as Promise<T>;
    writeQueue = queued.catch(() => {});
    return queued;
  };
  const createFile = (deviceMid: string): OnboardingRecordFile => ({
    version: 2,
    deviceMid,
    entries: [],
    decisions: [],
  });

  return {
    async appendRecord(deviceMid: string, entry: OnboardingRecordEntryInput): Promise<void> {
      await enqueueWrite(async () => {
        const filePath = getRecordFile();
        const existing = await readRecordFile(filePath);
        // deviceMid 以文件内已有值为权威：本地文件不变是设备关联的前提，
        // 调用方传入不同值只说明异常（如 getDeviceId 行为变化），记录并沿用旧值。
        let file: OnboardingRecordFile;
        if (existing) {
          if (existing.deviceMid !== deviceMid) {
            logger.warn(
              undefined,
              "deviceMid mismatch, keep existing:",
              existing.deviceMid,
              "incoming:",
              deviceMid,
            );
          }
          file = existing;
        } else {
          file = createFile(deviceMid);
        }
        const record: OnboardingRecordEntry = {
          userId,
          ...entry,
          uploadState: "pending",
        };
        // 每 userId（含 null）至多一条：同一用户重复完成引导（debug 重置后再答等）覆盖旧条目，
        // 而不是追加——覆盖后的新答案重新置 pending，等待上传。
        const previousIndex = file.entries.findIndex((item) => item.userId === userId);
        const validated = onboardingRecordEntrySchema.parse(record);
        if (previousIndex >= 0) file.entries[previousIndex] = validated;
        else file.entries.push(validated);
        file.decisions = file.decisions.filter((decision) => decision.userId !== userId);
        await mkdir(join(filePath, ".."), { recursive: true });
        await atomicWriteText(filePath, JSON.stringify(file, null, 2));
      });
    },

    async dismissOnboarding(deviceMid: string): Promise<void> {
      await enqueueWrite(async () => {
        const filePath = getRecordFile();
        const file = (await readRecordFile(filePath)) ?? createFile(deviceMid);
        if (file.entries.some((entry) => entry.userId === userId)) return;
        const decision = onboardingDecisionSchema.parse({
          userId,
          status: "dismissed",
          reason: "user_closed",
          decidedAt: new Date().toISOString(),
        });
        const index = file.decisions.findIndex((item) => item.userId === userId);
        if (index >= 0) file.decisions[index] = decision;
        else file.decisions.push(decision);
        await mkdir(join(filePath, ".."), { recursive: true });
        await atomicWriteText(filePath, JSON.stringify(file, null, 2));
      });
    },

    async getLatestEntry(): Promise<OnboardingRecordEntry | null> {
      const file = await readRecordFile(getRecordFile());
      if (!file) return null;
      let latest: OnboardingRecordEntry | undefined;
      for (const entry of file.entries) {
        if (entry.userId === userId) latest = entry;
      }
      return latest ?? null;
    },

    async updateRecordPreferences(
      patch: Partial<
        Pick<OnboardingRecordEntryInput, "memoryEnabled" | "proactiveSuggestionsEnabled">
      >,
    ): Promise<void> {
      await enqueueWrite(async () => {
        const filePath = getRecordFile();
        const file = await readRecordFile(filePath);
        if (!file) return;
        const index = file.entries.findLastIndex((entry) => entry.userId === userId);
        if (index < 0) return;
        file.entries[index] = onboardingRecordEntrySchema.parse({
          ...file.entries[index],
          ...patch,
        });
        await atomicWriteText(filePath, JSON.stringify(file, null, 2));
      });
    },

    async getRecords(): Promise<OnboardingRecordFile | null> {
      return readRecordFile(getRecordFile());
    },

    async clearRecords(): Promise<void> {
      await enqueueWrite(async () => {
        await rm(getRecordFile(), { force: true });
      });
    },
  };
}
