import type { WorkspacePurpose, NexTaskMeta } from "@nex/shared";

export type NexTaskListKind = "pinned" | "archived" | "timeline" | "active";
export type NexTaskListSortBy = "created" | "updated";

export interface NexTaskListWorkspaceScope {
  workspacePath: string;
  workspaceIdentity?: string;
  workspacePurpose?: WorkspacePurpose;
}

export interface NexTaskListQuery {
  kind: NexTaskListKind;
  workspaceScopes: NexTaskListWorkspaceScope[];
  sortBy: NexTaskListSortBy;
  search?: string;
  limit?: number;
}

export type NexTaskListItem = NexTaskMeta & {
  searchSnippet?: string;
  searchSnippets?: string[];
};

export interface NexTaskListResult {
  items: NexTaskListItem[];
  total: number;
  hasMore: boolean;
}

export type NexTaskGroupColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface NexTaskGroup {
  id: string;
  title: string;
  color: NexTaskGroupColor;
  createdAt: number;
  updatedAt: number;
}

export interface NexGroupedTaskRef {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

export type NexGroupedTaskViewTopLevelNodeRef =
  | { type: "group"; groupId: string }
  | { type: "task"; task: NexGroupedTaskRef };

export type NexGroupedTaskViewNode =
  | {
      type: "group";
      group: NexTaskGroup;
      tasks: NexTaskListItem[];
      sortOrder?: number;
    }
  | {
      type: "task";
      task: NexTaskListItem;
      sortOrder?: number;
    };

export interface NexGroupedTaskView {
  nodes: NexGroupedTaskViewNode[];
}

export interface NexGroupedTaskViewQuery {
  workspaceScopes: NexTaskListWorkspaceScope[];
  includeAllWorkspaces?: boolean;
}

// ── grouped 原始结构（不 join tasks 表）──
// grouped 视图的任务数据源迁到 sessions-index 后，服务端只提供分组结构
// （task_groups / task_group_members / task_group_view_node_orders），
// 由客户端与 sessions-index 会话做 join。

/** 组成员引用（不含任务 meta；task 内容由 sessions-index 提供）。 */
export interface NexGroupedTaskViewStructureMember {
  groupId: string;
  /** 服务端口径 workspaceKey（resolveWorkspaceKey：identity ?? path），join 匹配键。 */
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
  /** null = 尚未落 sort_order（新加入组）；客户端按 addedAt 降序补内存序。 */
  sortOrder: number | null;
  addedAt: number;
}

/** 顶层节点排序（task_group_view_node_orders，node_key 已解析为结构化引用）。 */
export type NexGroupedTaskViewStructureTopOrder =
  | { type: "group"; groupId: string; sortOrder: number }
  | { type: "task"; workspaceKey: string; taskId: string; sortOrder: number };

export interface NexGroupedTaskViewStructure {
  /** 已按 workspaceScopes 可见性过滤的 group（bootstrap workspace group 只在其 workspace 可见）。 */
  groups: NexTaskGroup[];
  /** 全量组成员（含不可见 group 的成员——顶层排除规则需要全量判断）。 */
  members: NexGroupedTaskViewStructureMember[];
  topLevelOrders: NexGroupedTaskViewStructureTopOrder[];
}

export interface NexGroupedTaskViewOrderInput {
  workspaceScopes: NexTaskListWorkspaceScope[];
  topLevelNodes: NexGroupedTaskViewTopLevelNodeRef[];
  groups: Array<{
    groupId: string;
    taskRefs: NexGroupedTaskRef[];
  }>;
}

export interface NexWorkspaceEventSubscriptionParams {
  workspacePath: string;
  workspaceIdentity?: string;
}
