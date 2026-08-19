/**
 * 局内 HUD:计时、剩余数、暂停、三个道具按钮、开局提示、分数飘字。
 *
 * 全部走 DOM —— 文字排版、点击区域、可访问性都是 DOM 的强项,
 * 而这些东西画进 3D 场景既要为每种分辨率单独缩放,又会被透视糊掉。
 */

import { POWERUPS, TRAY, type PowerupId } from '../config';
import type { HudState } from '../game/session';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** 道具 id → 图标素材名 */
const ICONS: Record<PowerupId, string> = {
  takeOut: 'booster-remove',
  complete: 'booster-match',
  shuffle: 'booster-shuffle',
};

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class Hud {
  readonly root = el('div', 'tp-hud');

  private readonly timer = el('div', 'tp-timer tp-mono', '0:00');
  private readonly left = el('div', 'tp-left');
  private readonly buttons = new Map<PowerupId, HTMLButtonElement>();
  private tip: HTMLElement | null = null;
  private floatTimer = 0;

  constructor(onPause: () => void, onPowerup: (id: PowerupId) => void, showTip: boolean) {
    const top = el('div', 'tp-top');
    const pause = el('button', 'tp-pause');
    pause.append(el('span'));
    pause.setAttribute('aria-label', '暂停');
    pause.addEventListener('click', onPause);
    this.left.innerHTML = '<b>0</b>剩余';
    // 左上角是游戏页的「返回盒子」按钮(page.tsx 里那个),这里必须让位,
    // 所以暂停键放右边 —— 两个圆钮叠在一起是必然的误触
    const spacer = el('div', 'tp-spacer');
    const right = el('div', 'tp-right');
    right.append(this.left, pause);
    top.append(spacer, this.timer, right);

    const powers = el('div', 'tp-powers');
    for (const item of POWERUPS) {
      const button = el('button', 'tp-power');
      const icon = el('i');
      // 图标素材按 id 命名。「打乱」的素材还没有 —— 404 时 CSS 里那层木纹金边兜底会露出来,
      // 按钮照样能看能用;素材补上之后不用改代码
      icon.style.setProperty('--icon', `url("/triple-pile/ui/${ICONS[item.id]}.png")`);
      button.append(icon, el('span', undefined, item.label));
      button.title = item.desc;
      button.addEventListener('click', () => onPowerup(item.id));
      // 道具按钮在第 3 关(首次可能塞满的那关)之前不显示 —— 新手不该在还没理解规则时
      // 面对三个不知道干什么的按钮。由外部通过 setPowerupsVisible 控制
      this.buttons.set(item.id, button);
      powers.append(button);
    }

    this.root.append(top, powers);

    if (showTip) {
      this.tip = el('div', 'tp-tip tp-toast', '点食材放进下方格子 · 凑齐 3 个就消');
      this.root.append(this.tip);
    }
  }

  setPowerupsVisible(visible: boolean) {
    for (const button of this.buttons.values()) button.style.display = visible ? '' : 'none';
  }

  update(state: HudState) {
    this.timer.textContent = formatTime(state.remainMs);
    this.timer.classList.toggle('tp-urgent', state.remainMs <= 15000);
    this.left.innerHTML = `<b>${state.left}</b>剩余`;
    for (const [id, button] of this.buttons) button.disabled = !state.powerups[id];
    // 槽位告急时给按钮组一点存在感 —— 视觉预警,和 sfxWarn 的听觉预警配合
    this.root.classList.toggle('tp-warn', state.trayCount >= TRAY.warnAt);
  }

  /** 第一次三消完成,提示淡出并永不再来 */
  dismissTip() {
    if (!this.tip) return;
    const node = this.tip;
    this.tip = null;
    node.style.opacity = '0';
    window.setTimeout(() => node.remove(), 420);
  }

  showFloat(text: string) {
    const node = el('div', 'tp-float tp-toast tp-mono', text);
    this.root.append(node);
    window.clearTimeout(this.floatTimer);
    this.floatTimer = window.setTimeout(() => node.remove(), 520);
  }

  dispose() {
    window.clearTimeout(this.floatTimer);
    this.root.remove();
  }
}
