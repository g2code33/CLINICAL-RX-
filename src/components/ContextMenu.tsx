import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface CtxItem {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick: () => void;
}

interface CtxState {
  x: number;
  y: number;
  items: CtxItem[];
}

const Ctx = createContext<(e: React.MouseEvent | React.TouchEvent, items: CtxItem[]) => void>(() => {});

/**
 * Context menu hook. Call showMenu(e, items) from onContextMenu (right click)
 * or onTouchStart (long-press ~500ms on mobile).
 */
export function useContextMenu() {
  return useContext(Ctx);
}

// One global long-press timer (only one press at a time).
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
function cancelLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}

/** Attach right-click AND long-press to an element. */
export function ctxHandlers(show: (e: any, items: CtxItem[]) => void, items: CtxItem[]) {
  const mk = (e: React.MouseEvent | React.TouchEvent) => show(e, items);
  return {
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); cancelLongPress(); mk(e); },
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      const startX = t.clientX, startY = t.clientY;
      cancelLongPress();
      longPressTimer = setTimeout(() => { longPressTimer = null; mk(e); }, 500);
    },
    onTouchMove: (e: React.TouchEvent) => {
      // Cancel if the finger moved a lot (that's a scroll, not a long-press).
      const t = e.touches[0];
      cancelLongPress();
    },
    onTouchEnd: cancelLongPress,
    onTouchCancel: cancelLongPress,
  };
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CtxState | null>(null);

  const show = (e: React.MouseEvent | React.TouchEvent, items: CtxItem[]) => {
    e.preventDefault?.();
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const y = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setState({ x, y, items });
  };

  // Close on outside LEFT-click / touch / scroll / escape. Right-button
  // (button === 2) must NOT close — that would kill right-click interaction.
  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onMouse = (ev: MouseEvent) => { if (ev.button === 2) return; close(); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    window.addEventListener('mousedown', onMouse);
    window.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouse);
      window.removeEventListener('touchstart', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [state]);

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let { x, y } = state;
    if (x + r.width > vw) x = Math.max(0, vw - r.width - 8);
    if (y + r.height > vh) y = Math.max(0, vh - r.height - 8);
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
  }, [state]);

  return (
    <Ctx.Provider value={show}>
      {children}
      {state && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
          onContextMenu={(e) => e.preventDefault()}
        >
          {state.items.map((it, i) => (
            <button
              key={i}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${it.danger ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setState(null); it.onClick(); }}
              onClick={(e) => { e.stopPropagation(); setState(null); it.onClick(); }}
            >
              {it.icon && <span className="w-5 text-center">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
