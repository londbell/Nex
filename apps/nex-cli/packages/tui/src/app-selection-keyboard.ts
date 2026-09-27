import type { KeyEvent } from "@mbears/opentui-core";
import type React from "react";
import type { SelectionState, SubmitValueOptions } from "./app-model.js";
import { matchesText } from "./state.js";
import type { TuiSelectionItem } from "./types.js";

const DEFAULT_PENDING_CANCEL_STATUS = "Selection cancelled.";
const DEFAULT_FILTER_CLEAR_STATUS = "Selection filter cleared.";

export function filterSelectionItems(selection: SelectionState): TuiSelectionItem[] {
  if (selection.filterable === false) return [...selection.items];
  return selection.items.filter((item) =>
    matchesText(selection.filter, [
      item.primary,
      item.secondary,
      item.meta,
      item.command,
      ...(item.keywords ?? []),
    ]),
  );
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

// selectedIndex is global within the filtered rows, so the rendered
// slice must follow it instead of always drawing the first page.
export function visibleSelectionItemWindow(
  items: readonly TuiSelectionItem[],
  selectedIndex: number,
  maxVisible: number,
): {
  items: readonly TuiSelectionItem[];
  selectedIndex: number;
  startIndex: number;
} {
  if (items.length === 0 || maxVisible <= 0) {
    return {
      items: [],
      selectedIndex: 0,
      startIndex: 0,
    };
  }

  const clampedSelectedIndex = clampIndex(selectedIndex, items.length);
  const visibleCount = Math.min(maxVisible, items.length);
  const maxStartIndex = items.length - visibleCount;
  const startIndex = Math.min(Math.max(0, clampedSelectedIndex - visibleCount + 1), maxStartIndex);

  return {
    items: items.slice(startIndex, startIndex + visibleCount),
    selectedIndex: clampedSelectedIndex - startIndex,
    startIndex,
  };
}

export function handleSelectionKey(
  key: KeyEvent,
  selection: SelectionState,
  setSelection: React.Dispatch<React.SetStateAction<SelectionState | undefined>>,
  setStatus: (status: string) => void,
  submitValue: (value: string, options?: SubmitValueOptions) => Promise<void>,
  cancelPendingSelection?: () => void,
): void {
  if (selection.pending) {
    handlePendingSelectionKey(key, selection, setSelection, setStatus, cancelPendingSelection);
    return;
  }

  if (key.name === "escape") {
    setSelection(undefined);
    setStatus("Selection cancelled.");
    return;
  }

  const visible = filterSelectionItems(selection);
  if (key.name === "up") {
    setSelection((current) =>
      current
        ? { ...current, selectedIndex: clampIndex(current.selectedIndex - 1, visible.length) }
        : current,
    );
    return;
  }
  if (key.name === "down") {
    setSelection((current) =>
      current
        ? { ...current, selectedIndex: clampIndex(current.selectedIndex + 1, visible.length) }
        : current,
    );
    return;
  }
  if (key.name === "backspace") {
    if (selection.filterable === false) return;
    setSelection((current) =>
      current ? { ...current, filter: current.filter.slice(0, -1), selectedIndex: 0 } : current,
    );
    return;
  }
  if (key.name === "u" && key.ctrl) {
    if (selection.filterable === false) return;
    setSelection((current) => (current ? { ...current, filter: "", selectedIndex: 0 } : current));
    setStatus(DEFAULT_FILTER_CLEAR_STATUS);
    return;
  }
  if (key.name === "return") {
    submitSelectedItem(selection, visible, setSelection, setStatus, submitValue);
    return;
  }

  const character = printableKey(key);
  if (character && selection.filterable !== false) {
    setSelection((current) =>
      current ? { ...current, filter: `${current.filter}${character}`, selectedIndex: 0 } : current,
    );
  }
}

export function printableKey(key: KeyEvent): string | undefined {
  if (key.ctrl || key.meta) return undefined;
  if (key.name === "space") return " ";
  if (key.name.length === 1 && key.name >= " ") {
    return key.shift ? key.name.toUpperCase() : key.name;
  }
  if (key.sequence.length === 1 && key.sequence >= " ") return key.sequence;
  return undefined;
}

function handlePendingSelectionKey(
  key: KeyEvent,
  selection: SelectionState,
  setSelection: React.Dispatch<React.SetStateAction<SelectionState | undefined>>,
  setStatus: (status: string) => void,
  cancelPendingSelection?: () => void,
): void {
  if (key.name !== "escape") return;
  cancelPendingSelection?.();
  const cancelStatus = selection.pending?.cancelStatus ?? DEFAULT_PENDING_CANCEL_STATUS;
  setSelection((current) => (current ? { ...current, pending: undefined } : current));
  setStatus(cancelStatus);
}

function submitSelectedItem(
  selection: SelectionState,
  visible: TuiSelectionItem[],
  setSelection: React.Dispatch<React.SetStateAction<SelectionState | undefined>>,
  setStatus: (status: string) => void,
  submitValue: (value: string, options?: SubmitValueOptions) => Promise<void>,
): void {
  const item = visible[clampIndex(selection.selectedIndex, visible.length)];
  if (!item) {
    setStatus("No matching item to select.");
    return;
  }
  if (item.disabledReason) {
    setStatus(item.disabledReason);
    return;
  }
  const pending = item.pending;
  if (pending) {
    const selectedIndex = clampIndex(selection.selectedIndex, visible.length);
    setSelection((current) =>
      current
        ? {
            ...current,
            filter: "",
            pending: {
              ...pending,
              command: item.command,
              itemId: item.id,
            },
            selectedIndex,
          }
        : current,
    );
    setStatus(pending.status ?? `Selected ${item.primary}.`);
    void submitValue(item.command, {
      abortStatus: pending.cancelStatus,
      preserveSelection: true,
    });
    return;
  }
  setSelection(undefined);
  setStatus(`Selected ${item.primary}.`);
  void submitValue(item.command);
}
