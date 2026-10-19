import type { INexSessionService } from "@nex/services";
import { useServices } from "@/hooks/useServices.js";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

export function useNexSessionService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): INexSessionService {
  // workspacePath 在引导页等入口会变化；无条件调用两个 hook，避免更新时 hook 顺序错位。
  // 无 path 仍使用当前 context，不能改为 workspace 解析出的 base 或远端断连服务。
  const currentContextServices = useServices();
  const workspaceServices = useWorkspaceServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
  );
  const services = workspacePath ? workspaceServices : currentContextServices;
  return services.nexSessionService;
}
