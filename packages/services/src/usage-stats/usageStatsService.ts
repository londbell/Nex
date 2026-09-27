import type { AppUsageRequest, AppUsageSnapshot } from "@nex/shared";
import type { INexAgentService } from "../nex-agent/nexAgent.js";
import type { IUsageStatsService } from "./usageStats.js";

export function createUsageStatsService(dependencies: {
  /** App Usage 经 Nex Protocol 读取 agent 数据库真实统计。 */
  nexAgentService: Pick<INexAgentService, "getAppUsageStats">;
}): IUsageStatsService {
  return {
    async getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
      return dependencies.nexAgentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      });
    },
  };
}
