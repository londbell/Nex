import { AlertTriangle } from "lucide-react";
import { useNexIntl } from "@/i18n/IntlProvider.js";

// App Usage 读取本地 Agent 数据库，失败原因对用户不可操作，统一展示通用文案。
export function UsageStatsErrorNotice({ error }: { error: string }) {
  const { intl } = useNexIntl();

  return (
    <div className="flex w-fit min-w-0 items-center gap-1.5 text-ui-base" title={error}>
      <AlertTriangle className="size-3 shrink-0 text-destructive" />
      <span className="min-w-0 truncate whitespace-nowrap text-destructive">
        {intl.formatMessage({ id: "usage.error.stats.generic" })}
      </span>
    </div>
  );
}
