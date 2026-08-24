import { create } from 'zustand';
import { ConfirmDialog, type ConfirmOptions } from './primitives';

/**
 * 🌐 APP-WIDE CONFIRMATION (Phase 9 §34)
 *
 * `useConfirm()` covers components, but services (`demo.ts`, export helpers)
 * and deeply nested callbacks also need to ask the user something. Those used
 * `window.confirm`, which is unstyled, blocks the renderer, cannot be themed
 * and is inconsistent with the rest of the product.
 *
 * This provides the same promise-based API as a plain function call:
 *
 *     if (!(await confirmAction({ title: '…', message: '…' }))) return;
 *
 * A single <GlobalConfirm /> mounted in the shell renders whatever is pending.
 */

interface ConfirmState {
  options: ConfirmOptions | null;
  resolve: ((v: boolean) => void) | null;
  open: (options: ConfirmOptions, resolve: (v: boolean) => void) => void;
  close: (value: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  options: null,
  resolve: null,
  open: (options, resolve) => set({ options, resolve }),
  close: (value) => {
    const { resolve } = get();
    set({ options: null, resolve: null });
    resolve?.(value);
  },
}));

/** Ask the user to confirm. Resolves true if they accept. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  // Outside a browser (SSR, tests) there is no one to ask — do not block.
  if (typeof window === 'undefined') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().open(options, resolve);
  });
}

/** Show the user a message they must acknowledge. Replaces window.alert. */
export function notifyAction(options: Omit<ConfirmOptions, 'cancelLabel'>): Promise<boolean> {
  return confirmAction({ ...options, cancelLabel: '', confirmLabel: options.confirmLabel ?? 'OK' });
}

/** Mount once, near the root of the app. */
export function GlobalConfirm() {
  const options = useConfirmStore((s) => s.options);
  const close = useConfirmStore((s) => s.close);
  return <ConfirmDialog open={!!options} options={options} onConfirm={() => close(true)} onCancel={() => close(false)} />;
}
