import type { OAuthCachedSessionRestoreResult, UserInfo } from "@nex/shared";
import type { AlertDialogRequest } from "@/store/alertDialogStore.js";

export async function applyCachedOAuthSessionRestoreResult(params: {
  result: OAuthCachedSessionRestoreResult;
  setUser: (user: UserInfo | null) => void;
  requestAlert: (request: AlertDialogRequest) => Promise<boolean>;
  copy: AlertDialogRequest;
}): Promise<boolean> {
  if (params.result.status === "authenticated") {
    params.setUser(params.result.userInfo);
    return true;
  }

  if (params.result.status === "reauthentication-required") {
    // 认证事实已经失效，不能等用户确认弹窗后才清 UI 登录态。
    // 二次开发：不再强制跳转登录页，用户可从模型设置按需重新登录。
    params.setUser(null);
    await params.requestAlert(params.copy);
  }

  return false;
}
