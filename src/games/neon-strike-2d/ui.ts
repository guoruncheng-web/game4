import * as Phaser from 'phaser';
import { COLORS } from './config';
import { sfx } from './sfx';

/** 居中的霓虹面板底板 */
export function neonPanel(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  opts: { alpha?: number; stroke?: number } = {},
) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.panel, opts.alpha ?? 0.9).fillRect(x - w / 2, y - h / 2, w, h);
  g.lineStyle(2, opts.stroke ?? COLORS.cyan, 0.7).strokeRect(x - w / 2, y - h / 2, w, h);
  return g;
}

export type NeonButton = {
  root: Phaser.GameObjects.Container;
  setEnabled(value: boolean): void;
  setLabel(value: string): void;
};

/** 统一手感的按钮:悬停描边变亮、按下轻微缩放、点击带 UI 音效 */
export function neonButton(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  label: string,
  onClick: () => void,
  opts: { size?: number; accent?: number; enabled?: boolean; silent?: boolean } = {},
): NeonButton {
  const accent = opts.accent ?? COLORS.cyan;
  const bg = scene.add.rectangle(0, 0, w, h, COLORS.deep, 0.96).setStrokeStyle(3, accent);
  const inner = scene.add.rectangle(0, 0, w - 24, h - 16).setStrokeStyle(1, COLORS.cyanDim, 0.7);
  const text = scene.add.text(0, 0, label, {
    fontFamily: 'system-ui', fontSize: `${opts.size ?? 24}px`, color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, inner, text]);
  let enabled = opts.enabled ?? true;

  const paint = () => {
    bg.setStrokeStyle(3, enabled ? accent : 0x37485a);
    text.setColor(enabled ? '#ffffff' : '#5f7386');
    inner.setStrokeStyle(1, enabled ? COLORS.cyanDim : 0x2a3946, 0.7);
    root.setAlpha(enabled ? 1 : 0.75);
  };
  paint();

  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => { if (enabled) bg.setFillStyle(COLORS.deep, 1).setStrokeStyle(3, 0xb9f6ff); });
  bg.on('pointerout', () => { bg.setFillStyle(COLORS.deep, 0.96); paint(); root.setScale(1); });
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

/** 三选一之类的分段选择器 */
export function segmented<T extends string>(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  items: Array<{ id: T; label: string }>,
  current: T,
  onPick: (id: T) => void,
) {
  const gap = 10;
  const cellW = (w - gap * (items.length - 1)) / items.length;
  const cells = items.map((item, i) => {
    const cx = x - w / 2 + cellW / 2 + i * (cellW + gap);
    const bg = scene.add.rectangle(cx, y, cellW, h, COLORS.deep, 0.9).setStrokeStyle(2, COLORS.cyanDim);
    const text = scene.add.text(cx, y, item.label, {
      fontFamily: 'system-ui', fontSize: '20px', color: '#8fb6cb', fontStyle: 'bold',
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
    for (const cell of cells) {
      const active = cell.id === current;
      cell.bg.setStrokeStyle(active ? 3 : 2, active ? COLORS.cyan : COLORS.cyanDim);
      cell.bg.setFillStyle(active ? 0x0e3d55 : COLORS.deep, active ? 1 : 0.9);
      cell.text.setColor(active ? '#eafbff' : '#8fb6cb');
    }
  }
  repaint();
  return { repaint };
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
    const cell = scene.add.rectangle(cx, y, cellW, 22, COLORS.deep, 0.9).setStrokeStyle(1, COLORS.cyanDim);
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
      cell.setFillStyle(on ? COLORS.cyan : COLORS.deep, on ? 0.95 : 0.9);
      cell.setStrokeStyle(1, on ? COLORS.cyan : COLORS.cyanDim);
    });
  }
  repaint();
  return { cells, repaint, setValue(v: number) { value = v; repaint(); } };
}
