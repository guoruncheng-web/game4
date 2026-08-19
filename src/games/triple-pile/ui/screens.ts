/**
 * 弹层:暂停、失败、最终通关。
 * 同一时刻只允许有一个,由 index.ts 的 show() 管。
 */

import { getLevel } from '../levels';
import type { Result } from '../game/session';
import { formatTime } from './hud';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function screen(children: HTMLElement[]) {
  const root = el('div', 'tp-screen');
  const panel = el('div', 'tp-panel');
  panel.append(...children);
  root.append(panel);
  return root;
}

function button(label: string, onClick: () => void, ghost = false) {
  const node = el('button', `tp-btn${ghost ? ' tp-ghost' : ''}`, label);
  node.addEventListener('click', onClick);
  return node;
}

// ---------------------------------------------------------------- 暂停

export function pauseScreen(levelId: number, actions: {
  onResume: () => void; onRestart: () => void; onFirst: () => void;
}) {
  return screen([
    el('div', 'tp-title', '暂停'),
    el('div', 'tp-sub', `第 ${levelId} 关`),
    withActions([
      button('继续', actions.onResume),
      button('重开本关', actions.onRestart, true),
      ...(levelId > 1 ? [button('从第一关开始', actions.onFirst, true)] : []),
    ]),
  ]);
}

// ---------------------------------------------------------------- 结算

export function resultScreen(levelId: number, result: Result, reason: 'time' | 'stuck' | 'win', actions: {
  onRetry: () => void; onFirst: () => void;
}) {
  const level = getLevel(levelId);
  const stats = el('div', 'tp-stats');
  const row = (label: string, value: string) => {
    const node = el('span');
    node.append(el('i', undefined, label), el('em', undefined, value));
    (node.lastElementChild as HTMLElement).style.fontStyle = 'normal';
    return node;
  };
  stats.append(
    row('得分', String(result.score)),
    row('用时', formatTime(result.elapsedMs)),
    row('剩余时间', formatTime(result.remainMs)),
    row('未用道具', `${result.unusedPowerups} 个`),
  );

  const subtitle = result.won
    ? `第 ${levelId} 关通关`
    : reason === 'time'
      ? '时间到了'
      : '格子塞满了,而且没有能凑成 3 个的';

  return screen([
    el('div', 'tp-title', result.won ? '清空!' : '这一锅没理完'),
    el('div', 'tp-sub', subtitle),
    stats,
    withActions([
      button(result.won ? '再玩第二关' : '重试本关', actions.onRetry),
      ...(levelId > 1 ? [button('从第一关开始', actions.onFirst, true)] : []),
    ]),
    el('div', 'tp-sub', `${level.typeCount} 类 · ${level.total} 个`),
  ]);
}

function withActions(children: HTMLElement[]) {
  const node = el('div', 'tp-actions');
  node.append(...children);
  return node;
}

export function loadingScreen(text = '正在烧这一锅…') {
  const root = el('div', 'tp-screen');
  root.append(el('div', 'tp-loading', text));
  return root;
}
