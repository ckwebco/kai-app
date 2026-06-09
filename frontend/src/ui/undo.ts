// Compatibility hook around src/undo.ts pub/sub.
import { showUndo as _show, dismissUndo as _dismiss } from "@/src/undo";

type ShowArg = { message: string; onUndo: () => Promise<void> | void; durationMs?: number };

export function useUndo() {
  return {
    show: ({ message, onUndo, durationMs }: ShowArg) =>
      _show({ id: String(Date.now()), text: message, onUndo }, durationMs ?? 5000),
    dismiss: _dismiss,
  };
}
