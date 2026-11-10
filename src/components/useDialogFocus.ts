'use client';

import { useEffect, useRef, type RefObject } from 'react';

let scrollLocks = 0;
let originalBodyOverflow = '';

/** 弹层打开时移入焦点，限制 Tab，关闭后恢复发起控件；仅最上层消费 Escape。 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled = true, viewKey = '') {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLocks === 0) originalBodyOverflow = document.body.style.overflow;
    scrollLocks += 1;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    root.tabIndex = -1;
    (controls()[0] ?? root).focus();
    const onKey = (event: KeyboardEvent) => {
      const top = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(node => node.getClientRects().length > 0).at(-1);
      if (top && top !== root && !top.contains(root)) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = controls(), first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = originalBodyOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [enabled, ref, viewKey]);
}
