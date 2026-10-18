import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  createEditor,
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  applyImeCompositionEvent,
  createImeEnterGuardState,
  endImeConfirmWindow,
  isImeConfirmEnter,
  handleImeConfirmEnter,
  isImeComposingKeyEvent,
  bindImeEnterGuard,
  resetImeEnterGuardState,
} from "../src/lib/imeComposition.js";

function makeEnterEvent(overrides: { isComposing?: boolean; keyCode?: number } = {}) {
  return {
    isComposing: false,
    keyCode: 13,
    nativeEvent: undefined,
    ...overrides,
  };
}

test("isImeComposingKeyEvent：组合中的 keydown 应被识别", () => {
  assert.equal(isImeComposingKeyEvent({ isComposing: true }), true);
  assert.equal(isImeComposingKeyEvent({ nativeEvent: { isComposing: true } }), true);
  assert.equal(isImeComposingKeyEvent({ compositionActive: true }), true);
  assert.equal(isImeComposingKeyEvent({}), false);
});

test("Safari 时序：compositionend 后紧随的第一次 Enter 应被识别为 IME 确认键", () => {
  const state = createImeEnterGuardState();
  // Safari：compositionend 先于确认键 keydown，keydown.isComposing 已回退 false
  applyImeCompositionEvent(state, "compositionstart");
  applyImeCompositionEvent(state, "compositionend");
  const confirmEnter = makeEnterEvent({ isComposing: false });
  assert.equal(isImeConfirmEnter(state, confirmEnter), true);
});

test("确认 Enter 松键后，下一次 Enter 恢复发送语义", () => {
  const state = createImeEnterGuardState();
  applyImeCompositionEvent(state, "compositionend");
  endImeConfirmWindow(state); // 确认键 keyup 结束当前按键序列
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
});

test("组合进行中的 Enter（isComposing / 本地镜像 / keyCode 229）应被识别", () => {
  const state = createImeEnterGuardState();
  assert.equal(isImeConfirmEnter(state, makeEnterEvent({ isComposing: true })), true);
  assert.equal(isImeConfirmEnter(state, makeEnterEvent({ keyCode: 229 })), true);

  const mirrored = createImeEnterGuardState();
  applyImeCompositionEvent(mirrored, "compositionstart");
  assert.equal(isImeConfirmEnter(mirrored, makeEnterEvent()), true);
});

test("组合结束后输入其他按键，随后的 Enter 不再被吞", () => {
  const state = createImeEnterGuardState();
  applyImeCompositionEvent(state, "compositionend");
  endImeConfirmWindow(state); // 原生 keydown 跟踪层在非 Enter 键时调用
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
});

test("compositionstart 会重置确认窗口：新组合开始后不会残留上次的确认标记", () => {
  const state = createImeEnterGuardState();
  applyImeCompositionEvent(state, "compositionend");
  applyImeCompositionEvent(state, "compositionstart");
  assert.equal(state.compositionJustEnded, false);
  assert.equal(state.compositionActive, true);
});

test("compositionend 重新进入确认窗口（连续两次组合场景）", () => {
  const state = createImeEnterGuardState();
  applyImeCompositionEvent(state, "compositionend");
  endImeConfirmWindow(state);
  applyImeCompositionEvent(state, "compositionstart");
  applyImeCompositionEvent(state, "compositionend");
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), true);
});

test("默认状态下的普通 Enter 不是 IME 确认键", () => {
  const state = createImeEnterGuardState();
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
});

test("keyCode 229 兼容原生与 React 事件，不影响普通键", () => {
  assert.equal(isImeComposingKeyEvent({ keyCode: 229 }), true);
  assert.equal(isImeComposingKeyEvent({ nativeEvent: { keyCode: 229 } }), true);
  assert.equal(isImeComposingKeyEvent({ keyCode: 13 }), false);
});

test("组合结束后的确认窗口保护重复 keydown，不能在长按时误发送", () => {
  const state = createImeEnterGuardState();
  applyImeCompositionEvent(state, "compositionstart");
  applyImeCompositionEvent(state, "compositionend");
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), true);
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), true);
  endImeConfirmWindow(state);
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
});

test("失焦或销毁清除组合状态和确认窗口", () => {
  const state = createImeEnterGuardState();
  applyImeCompositionEvent(state, "compositionstart");
  resetImeEnterGuardState(state);
  assert.deepEqual(state, createImeEnterGuardState());
  applyImeCompositionEvent(state, "compositionend");
  resetImeEnterGuardState(state);
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
});

function createGuardTarget() {
  const document = new EventTarget();
  const root = Object.assign(new EventTarget(), { ownerDocument: document });
  const state = createImeEnterGuardState();
  const dispose = bindImeEnterGuard(root as unknown as HTMLElement, state);
  const dispatch = (
    type: string,
    values: { key?: string; keyCode?: number; isComposing?: boolean } = {},
  ) => {
    const event = Object.assign(new Event(type, { cancelable: true }), values);
    root.dispatchEvent(event);
    return event;
  };
  return { document, root, state, dispose, dispatch };
}

test("原生监听：Safari compositionend 在 keydown 前，keyup 后立即恢复发送", () => {
  const { state, dispatch, dispose } = createGuardTarget();
  dispatch("compositionstart");
  dispatch("compositionend");
  const enter = dispatch("keydown", { key: "Enter", isComposing: false, keyCode: 13 });
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), true);
  assert.equal(enter.defaultPrevented, false); // 跟踪层不阻止输入法原生上屏。
  dispatch("keyup", { key: "Enter" });
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
  dispose();
});

test("原生监听：Chromium keydown 在 compositionend 前，不吞下一次发送", () => {
  const { state, dispatch, dispose } = createGuardTarget();
  dispatch("compositionstart");
  dispatch("keydown", { key: "Enter", isComposing: true, keyCode: 229 });
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), true);
  dispatch("compositionend");
  dispatch("keyup", { key: "Enter" });
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
  dispose();
});

test("原生监听：空格/数字选词在松键后恢复；非 Enter keydown 清除旧窗口", () => {
  for (const key of [" ", "1", "ArrowRight"]) {
    const { state, dispatch, dispose } = createGuardTarget();
    dispatch("compositionstart");
    dispatch("compositionend");
    dispatch("keyup", { key });
    assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
    dispatch("compositionend");
    dispatch("keydown", { key });
    assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
    dispose();
  }
});

test("原生监听：鼠标松开和失焦清理守卫；解绑后没有残留监听", () => {
  const { document, state, dispatch, dispose } = createGuardTarget();
  dispatch("compositionend");
  document.dispatchEvent(new Event("pointerup"));
  assert.equal(isImeConfirmEnter(state, makeEnterEvent()), false);
  dispatch("compositionstart");
  dispatch("blur");
  assert.deepEqual(state, createImeEnterGuardState());
  dispatch("compositionend");
  dispose();
  assert.deepEqual(state, createImeEnterGuardState());
  dispatch("compositionstart");
  assert.deepEqual(state, createImeEnterGuardState());
});

test("命令消费：Safari 确认 Enter 不落入发送/联想/换行，松键后恢复", () => {
  const { state, dispatch, dispose } = createGuardTarget();
  dispatch("compositionstart");
  dispatch("compositionend");
  const enter = dispatch("keydown", { key: "Enter", isComposing: false, keyCode: 13 });
  assert.equal(handleImeConfirmEnter(state, enter), true);
  assert.equal(enter.defaultPrevented, true);
  dispatch("keyup", { key: "Enter" });
  const send = dispatch("keydown", { key: "Enter", isComposing: false, keyCode: 13 });
  assert.equal(handleImeConfirmEnter(state, send), false);
  assert.equal(send.defaultPrevented, false);
  dispose();
});

test("命令消费：组词中或 keyCode 229 的 Enter 不阻止原生上屏", () => {
  for (const values of [{ isComposing: true }, { keyCode: 229 }]) {
    const state = createImeEnterGuardState();
    const event = Object.assign(new Event("keydown", { cancelable: true }), values);
    assert.equal(handleImeConfirmEnter(state, event), true);
    assert.equal(event.defaultPrevented, false);
  }
});

test("原生 KeyboardEvent 的输入法字段在原型上仍能读取", () => {
  for (const values of [{ isComposing: true }, { keyCode: 229 }]) {
    const event = Object.create(values) as { isComposing?: boolean; keyCode?: number };
    assert.equal(isImeConfirmEnter(createImeEnterGuardState(), event), true);
  }
});

test("Lexical 命令顺序：业务发送处理器重注册不影响 IME 优先于联想", () => {
  const editor = createEditor({ namespace: "ime-enter-guard-test" });
  const state = createImeEnterGuardState();
  let sends = 0;
  let suggestions = 0;
  const unregisterIme = editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => event !== null && handleImeConfirmEnter(state, event),
    COMMAND_PRIORITY_CRITICAL,
  );
  const registerSend = () =>
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        sends += 1;
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  let unregisterSend = registerSend();
  const unregisterSuggestion = editor.registerCommand(
    KEY_ENTER_COMMAND,
    () => {
      suggestions += 1;
      return true;
    },
    COMMAND_PRIORITY_CRITICAL,
  );
  unregisterSend();
  unregisterSend = registerSend();

  applyImeCompositionEvent(state, "compositionend");
  const confirm = Object.assign(new Event("keydown", { cancelable: true }), makeEnterEvent());
  assert.equal(
    editor.dispatchCommand(KEY_ENTER_COMMAND, confirm as unknown as KeyboardEvent),
    true,
  );
  assert.equal(sends, 0);
  assert.equal(suggestions, 0);
  assert.equal(confirm.defaultPrevented, true);
  endImeConfirmWindow(state);
  editor.dispatchCommand(KEY_ENTER_COMMAND, confirm as unknown as KeyboardEvent);
  assert.equal(suggestions, 1);
  unregisterSuggestion();
  editor.dispatchCommand(KEY_ENTER_COMMAND, confirm as unknown as KeyboardEvent);
  assert.equal(sends, 1);
  unregisterSend();
  unregisterIme();
});

test("原生监听：多个编辑器的组合状态相互隔离", () => {
  const first = createGuardTarget();
  const second = createGuardTarget();
  first.dispatch("compositionstart");
  assert.equal(isImeConfirmEnter(first.state, makeEnterEvent()), true);
  assert.equal(isImeConfirmEnter(second.state, makeEnterEvent()), false);
  first.dispose();
  second.dispose();
});
