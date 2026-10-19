import { Button, useNexIntl } from "@nex/ui";
import type { WebConnectionState } from "./webConnectionRecovery.js";

/** 断线不是空对话：保留底层页面与草稿，用独立状态条明确提示恢复中。 */
export function WebConnectionStatus({
  state,
  onRetry,
}: {
  state: WebConnectionState;
  onRetry: () => void;
}) {
  const { intl } = useNexIntl();
  if (state === "connected" || state === "connecting") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-web-connection-state={state}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-ui-base text-foreground shadow-lg"
    >
      <span>
        {intl.formatMessage({ id: "chat.error.connectionLost" })}
        {state === "reconnecting" ? ` · ${intl.formatMessage({ id: "common.loading" })}` : ""}
      </span>
      {state === "reconnecting" ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {intl.formatMessage({ id: "workspaceSidebar.reconnect" })}
        </Button>
      ) : null}
    </div>
  );
}
