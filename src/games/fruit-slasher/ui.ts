import * as Phaser from 'phaser';
import { PALETTE } from './config';
import { sfx } from './sfx';

/**
 * 水果切切乐自己的一套 UI 组件。
 * 刻意不复用 neon-strike 的 ui.ts:一是 CLAUDE.md 禁止跨游戏 import,
 * 二是两款游戏的美术方向本来就不同(霓虹冷光 vs 灯笼暖木),共用一套按钮会两边都不像。
 */

/** 居中的木牌面板 */
export function woodPanel(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  opts: { alpha?: number } = {},
) {
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.night, opts.alpha ?? 0.94).fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
  g.lineStyle(3, PALETTE.woodLit, 0.95).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
  g.lineStyle(1, PALETTE.amber, 0.35).strokeRoundedRect(x - w / 2 + 6, y - h / 2 + 6, w - 12, h - 12, 10);
  return g;
}

export type WoodButton = {
  root: Phaser.GameObjects.Container;
  setEnabled(value: boolean): void;
  setLabel(value: string): void;
};

/** 统一手感的按钮:悬停变亮、按下轻微缩放、点击带 UI 音效 */
export function woodButton(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  label: string,
  onClick: () => void,
  opts: { size?: number; accent?: number; enabled?: boolean; silent?: boolean } = {},
): WoodButton {
  const accent = opts.accent ?? PALETTE.amber;
  const bg = scene.add.rectangle(0, 0, w, h, PALETTE.wood, 0.96).setStrokeStyle(3, accent);
  const inner = scene.add.rectangle(0, 0, w - 20, h - 14).setStrokeStyle(1, PALETTE.woodLit, 0.85);
  const text = scene.add.text(0, 0, label, {
    fontFamily: 'system-ui, sans-serif', fontSize: `${opts.size ?? 24}px`,
    fontStyle: 'bold', color: PALETTE.cream,
  }).setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, inner, text]);
  let enabled = opts.enabled ?? true;

  const paint = () => {
    bg.setStrokeStyle(3, enabled ? accent : 0x4b3a30);
    text.setColor(enabled ? PALETTE.cream : '#8d7a6c');
    inner.setStrokeStyle(1, enabled ? PALETTE.woodLit : 0x3d2f27, 0.85);
    root.setAlpha(enabled ? 1 : 0.75);
  };
  paint();

  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => { if (enabled) bg.setFillStyle(PALETTE.woodLit, 1); });
  bg.on('pointerout', () => { bg.setFillStyle(PALETTE.wood, 0.96); root.setScale(1); paint(); });
  bg.on('pointerdown', () => { if (enabled) root.setScale(0.97); });
  bg.on('pointerup', () => {
    root.setScale(1);
    if (!enabled) return;
    if (!opts.silent) sfx.ui();
    onClick();
  });

  return {
    root,
    setEnabled(value: boolean) { enabled = value; paint(); },
    setLabel(value: string) { text.setText(value); },
  };
}

/** 多选一的分段选择器,竖排或横排 */
export function segmented<T extends string>(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  items: Array<{ id: T; label: string }>,
  current: T,
  onPick: (id: T) => void,
  opts: { vertical?: boolean; gap?: number; size?: number } = {},
) {
  const gap = opts.gap ?? 10;
  const vertical = opts.vertical ?? false;
  const span = vertical ? h : w;
  const cell = (span - gap * (items.length - 1)) / items.length;

  const cells = items.map((item, i) => {
    const offset = -span / 2 + cell / 2 + i * (cell + gap);
    const cx = vertical ? x : x + offset;
    const cy = vertical ? y + offset : y;
    const bw = vertical ? w : cell;
    const bh = vertical ? cell : h;
    const bg = scene.add.rectangle(cx, cy, bw, bh, PALETTE.wood, 0.9).setStrokeStyle(2, PALETTE.woodLit);
    const text = scene.add.text(cx, cy, item.label, {
      fontFamily: 'system-ui, sans-serif', fontSize: `${opts.size ?? 20}px`,
      fontStyle: 'bold', color: '#a9b9bf',
    }).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (item.id === current) return;
      sfx.ui();
      current = item.id;
      repaint();
      onPick(item.id);
    });
    return { id: item.id, bg, text };
  });

  function repaint() {
    for (const c of cells) {
      const active = c.id === current;
      c.bg.setStrokeStyle(active ? 3 : 2, active ? PALETTE.amber : PALETTE.woodLit);
      c.bg.setFillStyle(active ? PALETTE.woodLit : PALETTE.wood, active ? 1 : 0.9);
      c.text.setColor(active ? PALETTE.cream : '#a9b9bf');
    }
  }
  repaint();
  return { cells: cells.flatMap((c) => [c.bg, c.text]), repaint };
}

/** 分段式音量条,点哪格就是哪格 */
export function volumeBar(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  steps: number,
  value: number,
  onChange: (value: number) => void,
) {
  const gap = 6;
  const cellW = (w - gap * (steps - 1)) / steps;
  const cells: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 0; i < steps; i++) {
    const cx = x - w / 2 + cellW / 2 + i * (cellW + gap);
    const cell = scene.add.rectangle(cx, y, cellW, 22, PALETTE.wood, 0.9).setStrokeStyle(1, PALETTE.woodLit);
    cell.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      value = (i + 1) / steps;
      repaint();
      onChange(value);
      sfx.ui();
    });
    cells.push(cell);
  }
  function repaint() {
    const filled = Math.round(value * steps);
    cells.forEach((cell, i) => {
      const on = i < filled;
      cell.setFillStyle(on ? PALETTE.amber : PALETTE.wood, on ? 0.95 : 0.9);
      cell.setStrokeStyle(1, on ? PALETTE.amber : PALETTE.woodLit);
    });
  }
  repaint();
  return { cells, repaint };
}
