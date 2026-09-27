import type {
  NexAgentMcpServer,
  NexAutomationScheduleRule,
  NexMcpListMode,
  ModelSelection,
} from "@nex/shared";

export interface NexAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}

export interface NexAgentPluginViewParams extends NexAgentWorkspaceTarget {
  configScope?: "user" | "workspace";
}

export interface NexAgentListMcpServerStatusesParams extends NexAgentWorkspaceTarget {
  mcpServers?: NexAgentMcpServer[];
  mode?: NexMcpListMode;
}

export interface NexAgentAddPluginMarketplaceParams extends NexAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  source: string;
}

export interface NexAgentRemovePluginMarketplaceParams extends NexAgentWorkspaceTarget {
  marketplace: string;
}

export interface NexAgentUpdatePluginMarketplaceParams extends NexAgentWorkspaceTarget {
  marketplace?: string;
  operationId?: string;
}

export interface NexAgentInstallPluginParams extends NexAgentWorkspaceTarget {
  dryRun?: boolean;
  marketplace: string;
  operationId?: string;
  pluginName: string;
  scope?: "user" | "workspace";
}

export interface NexAgentCancelPluginOperationParams {
  operationId: string;
}

export interface NexAgentUninstallPluginParams extends NexAgentWorkspaceTarget {
  marketplace?: string;
  pluginId?: string;
  pluginName?: string;
  removeCache?: boolean;
}

export interface NexAgentUpdatePluginParams extends NexAgentWorkspaceTarget {
  pluginId?: string;
  marketplace?: string;
}

export interface NexAgentRestoreBuiltinPluginParams extends NexAgentWorkspaceTarget {
  pluginId: string;
}

export interface NexAgentConfigurePluginParams extends NexAgentWorkspaceTarget {
  clearOptionKeys?: string[];
  dryRun?: boolean;
  options: Record<string, unknown>;
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface NexAgentResetPluginConfigParams extends NexAgentWorkspaceTarget {
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface NexAgentValidatePluginParams extends NexAgentWorkspaceTarget {
  marketplace?: string;
  pluginName?: string;
  source?: string;
}

export interface NexAgentDescribePluginParams extends NexAgentWorkspaceTarget {
  marketplace: string;
  pluginName: string;
}

export interface NexAgentSetPluginEnabledParams extends NexAgentWorkspaceTarget {
  enabled: boolean;
  operationId?: string;
  pluginId: string;
  scope?: "user" | "workspace";
}

// Plugin 对话引用 catalog：
// 带 sessionId → session-owned 冻结 catalog（必须路由到持有该 session 的 workspace client）；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。
export interface NexAgentPluginReferenceCatalogParams extends NexAgentWorkspaceTarget {
  sessionId?: string;
}

// Composer Skill catalog：与 Plugin 引用相同，以 sessionId 区分 workspace 当前目录和
// resident Session runtime 快照；不参与 Settings 管理目录。
export interface NexAgentSkillReferenceCatalogParams extends NexAgentWorkspaceTarget {
  sessionId?: string;
}
export interface NexAgentResolveSuggestedPluginReferenceParams extends NexAgentWorkspaceTarget {
  stableId: string;
  operationId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryKind: "desktop-continuous" | "web-remote-replayable";
}

// ---- 定时任务(automation)管理参数 ----

export interface NexAgentCreateAutomationParams extends NexAgentWorkspaceTarget {
  title: string;
  cronExpr: string;
  relativeDelayMinutes?: number;
  prompt: string;
  modelSelection?: ModelSelection;
  mode?: string;
  recurring?: boolean;
  maxRuns?: number;
  endAt?: number;
  scheduleRule?: NexAutomationScheduleRule;
}

export interface NexAgentUpdateAutomationParams extends NexAgentWorkspaceTarget {
  automationId: string;
  title?: string;
  cronExpr?: string;
  prompt?: string;
  modelSelection?: ModelSelection | null;
  mode?: string | null;
  recurring?: boolean;
  maxRuns?: number | null;
  endAt?: number | null;
  scheduleRule?: NexAutomationScheduleRule | null;
  scheduleEditedByUser?: boolean;
}

export interface NexAgentAutomationIdParams extends NexAgentWorkspaceTarget {
  automationId: string;
}

export interface NexAgentSetAutomationEnabledParams extends NexAgentWorkspaceTarget {
  automationId: string;
  enabled: boolean;
}

export interface NexAgentDeleteAutomationRunParams extends NexAgentWorkspaceTarget {
  runId: string;
}
