/**
 * 对话 IME 回车规格（KeyboardPlugin 是每个编辑器守卫状态的唯一所有者）：
 * - 输入法确认键不能发送、反转投递、选中联想项或清空草稿。
 * - Chromium: compositionstart → composing keydown → compositionend → keyup。
 * - Safari: compositionstart → compositionend → keydown(false / 229 或 13) → keyup。
 * - compositionend 保留确认窗口；确认键的重复 keydown 仍受保护，keyup 才解除。
 * - 非 Enter keydown、指针松开、失焦或根节点销毁解除窗口，不靠延时猜测顺序。
 * - 注册与解绑统一使用对象形式 capture；解绑后事件不得再次改变守卫状态。
 * - 输入法组合中的原生默认行为必须保留；组合结束后的普通确认 Enter 不插入换行。
 * - 普通 Enter、Shift+Enter、改绑发送、手机视口门禁沿用原路径；不改变 Host/协议。
 *
 * 远端人工 E2E（不在本机执行）：Safari + 搜狗回车确认中文/拼音只上屏，
 * 松键后再次 Enter 只发送一次；长按确认 Enter 不发送；Chromium 同场景不回退；
 * 空格/数字/鼠标选词后 Enter 正常发送；Shift+Enter 换行、Ctrl/Meta+Enter
 * 反转投递及改绑键在组词时均不发送；手机软键盘确认不发送；失焦再聚焦可正常发送。
 */
interface ImeKeyEvent {
  compositionActive?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}

export function isImeComposingKeyEvent(event: ImeKeyEvent): boolean {
  // Safari 的确认 keydown 可能已是 isComposing=false；229 仍表示输入法处理按键。
  return Boolean(
    event.compositionActive ||
      event.isComposing ||
      event.nativeEvent?.isComposing ||
      event.keyCode === 229 ||
      event.nativeEvent?.keyCode === 229,
  );
}

export interface ImeEnterGuardState {
  compositionActive: boolean;
  compositionJustEnded: boolean;
}

export function createImeEnterGuardState(): ImeEnterGuardState {
  return { compositionActive: false, compositionJustEnded: false };
}

export function applyImeCompositionEvent(
  state: ImeEnterGuardState,
  type: "compositionstart" | "compositionend",
): void {
  state.compositionActive = type === "compositionstart";
  state.compositionJustEnded = type === "compositionend";
}

export function endImeConfirmWindow(state: ImeEnterGuardState): void {
  state.compositionJustEnded = false;
}

export function resetImeEnterGuardState(state: ImeEnterGuardState): void {
  state.compositionActive = false;
  endImeConfirmWindow(state);
}

export function isImeConfirmEnter(state: ImeEnterGuardState, event: ImeKeyEvent): boolean {
  return state.compositionActive || state.compositionJustEnded || isImeComposingKeyEvent(event);
}

export function handleImeConfirmEnter(
  state: ImeEnterGuardState,
  event: ImeKeyEvent & { preventDefault: () => void },
): boolean {
  if (!isImeConfirmEnter(state, event)) {
    return false;
  }
  if (!state.compositionActive && !isImeComposingKeyEvent(event)) {
    event.preventDefault();
  }
  return true;
}

export function bindImeEnterGuard(
  rootElement: HTMLElement,
  state: ImeEnterGuardState,
): () => void {
  const handleCompositionStart = () => applyImeCompositionEvent(state, "compositionstart");
  const handleCompositionEnd = () => applyImeCompositionEvent(state, "compositionend");
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter") {
      endImeConfirmWindow(state);
    }
  };
  const handleKeyUp = () => endImeConfirmWindow(state);
  const handlePointerUp = () => endImeConfirmWindow(state);
  const handleBlur = () => resetImeEnterGuardState(state);
  const document = rootElement.ownerDocument;

  // Node EventTarget 解绑时读取 options.capture，布尔 true 会被按 false 匹配，导致监听残留。
  // 注册和解绑共用对象形式，保持与浏览器一致的 capture 语义。
  const listenerOptions = { capture: true };

  // 必须读原生 composition 事件：Lexical 在 Safari 会延后处理 COMPOSITION_END_COMMAND，
  // 只监听该命令会错过“compositionend → 确认 keydown”的窗口。这里只跟踪，不干扰上屏。
  rootElement.addEventListener("compositionstart", handleCompositionStart, listenerOptions);
  rootElement.addEventListener("compositionend", handleCompositionEnd, listenerOptions);
  rootElement.addEventListener("keydown", handleKeyDown, listenerOptions);
  rootElement.addEventListener("keyup", handleKeyUp, listenerOptions);
  rootElement.addEventListener("blur", handleBlur, listenerOptions);
  document.addEventListener("pointerup", handlePointerUp, listenerOptions);

  return () => {
    rootElement.removeEventListener("compositionstart", handleCompositionStart, listenerOptions);
    rootElement.removeEventListener("compositionend", handleCompositionEnd, listenerOptions);
    rootElement.removeEventListener("keydown", handleKeyDown, listenerOptions);
    rootElement.removeEventListener("keyup", handleKeyUp, listenerOptions);
    rootElement.removeEventListener("blur", handleBlur, listenerOptions);
    document.removeEventListener("pointerup", handlePointerUp, listenerOptions);
    resetImeEnterGuardState(state);
  };
}
