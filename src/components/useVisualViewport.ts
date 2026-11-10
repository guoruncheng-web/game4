'use client';

import { useEffect, type RefObject } from 'react';

/** 独立输入页随真实可视区域移动，避免手机键盘盖住底部发送/保存控件。 */
export function useVisualViewport(ref: RefObject<HTMLElement | null>, viewKey: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !viewKey) return;
    const viewport = window.visualViewport;
    const update = () => {
      root.style.setProperty('--native-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty('--native-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--native-viewport-height');
      root.style.removeProperty('--native-viewport-top');
    };
  }, [ref, viewKey]);
}
