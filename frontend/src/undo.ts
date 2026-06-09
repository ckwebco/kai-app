// Simple global pub/sub for undo snackbars.
type Listener = (msg: UndoMsg | null) => void;

export type UndoMsg = {
  id: string;
  text: string;
  onUndo: () => Promise<void> | void;
};

let current: UndoMsg | null = null;
const listeners = new Set<Listener>();
let timer: any = null;

export function showUndo(msg: UndoMsg, ms = 5000) {
  current = msg;
  listeners.forEach((l) => l(current));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    listeners.forEach((l) => l(null));
  }, ms);
}

export function dismissUndo() {
  current = null;
  if (timer) clearTimeout(timer);
  listeners.forEach((l) => l(null));
}

export function subscribeUndo(l: Listener) {
  listeners.add(l);
  l(current);
  return () => { listeners.delete(l); };
}
