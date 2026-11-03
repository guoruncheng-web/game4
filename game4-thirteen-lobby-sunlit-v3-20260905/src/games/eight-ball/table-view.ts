import * as Phaser from 'phaser';
import {
  BALL_R, BREAK_SPOT, PALETTE, PLAY, PLAY_HEIGHT, PLAY_WIDTH, POCKETS, POCKET_R, RAIL,
} from './config';

/**
 * 台面是完全静态的一张图,开局画一次就不再动。
 * 用 Graphics 一次性画完(不是每帧重画),它在 WebGL 下会被缓存成一批顶点,后续每帧只是提交。
 */
export function drawTable(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(0);

  // 外框木边
  g.fillStyle(PALETTE.rail, 1);
  g.fillRoundedRect(
    PLAY.left - RAIL, PLAY.top - RAIL,
    PLAY_WIDTH + RAIL * 2, PLAY_HEIGHT + RAIL * 2, 14,
  );
  g.fillStyle(PALETTE.railLit, 1);
  g.fillRoundedRect(
    PLAY.left - RAIL + 3, PLAY.top - RAIL + 3,
    PLAY_WIDTH + RAIL * 2 - 6, PLAY_HEIGHT + RAIL * 2 - 6, 12,
  );
  g.fillStyle(PALETTE.rail, 1);
  g.fillRoundedRect(
    PLAY.left - RAIL + 7, PLAY.top - RAIL + 7,
    PLAY_WIDTH + RAIL * 2 - 14, PLAY_HEIGHT + RAIL * 2 - 14, 10,
  );

  // 台呢:底色 + 四周压暗,中间自然亮起来
  g.fillStyle(PALETTE.clothDark, 1);
  g.fillRect(PLAY.left - 4, PLAY.top - 4, PLAY_WIDTH + 8, PLAY_HEIGHT + 8);
  g.fillStyle(PALETTE.cloth, 1);
  g.fillRect(PLAY.left, PLAY.top, PLAY_WIDTH, PLAY_HEIGHT);
  g.fillStyle(0x2a9463, 0.35);
  g.fillRect(PLAY.left + 26, PLAY.top + 60, PLAY_WIDTH - 52, PLAY_HEIGHT - 120);

  // 开球线与置球点
  g.lineStyle(1, 0xffffff, 0.16);
  g.lineBetween(PLAY.left, BREAK_SPOT.y, PLAY.right, BREAK_SPOT.y);
  g.fillStyle(0xffffff, 0.18);
  g.fillCircle(BREAK_SPOT.x, PLAY.top + PLAY_HEIGHT * 0.26, 2.2);

  // 库边上的菱形瞄点,老玩家靠它算角度
  g.fillStyle(0xf0e2c0, 0.75);
  for (let i = 1; i < 8; i++) {
    const y = PLAY.top + (PLAY_HEIGHT * i) / 8;
    if (i === 4) continue;
    diamond(g, PLAY.left - RAIL / 2 - 1, y);
    diamond(g, PLAY.right + RAIL / 2 + 1, y);
  }
  for (let i = 1; i < 4; i++) {
    const x = PLAY.left + (PLAY_WIDTH * i) / 4;
    diamond(g, x, PLAY.top - RAIL / 2 - 1);
    diamond(g, x, PLAY.bottom + RAIL / 2 + 1);
  }

  // 袋口
  for (const pocket of POCKETS) {
    g.fillStyle(0x24160d, 1);
    g.fillCircle(pocket.x, pocket.y, POCKET_R + 6);
    g.fillStyle(PALETTE.pocket, 1);
    g.fillCircle(pocket.x, pocket.y, POCKET_R + 1.5);
    g.fillStyle(0x000000, 0.55);
    g.fillCircle(pocket.x, pocket.y - 1.5, POCKET_R - 2);
  }
  return g;
}

/** 自由球阶段把可放置的区域提示出来 */
export function drawPlacementHint(g: Phaser.GameObjects.Graphics, kitchenOnly: boolean) {
  g.clear();
  g.fillStyle(0xffffff, 0.07);
  if (kitchenOnly) {
    const top = PLAY.top + PLAY_HEIGHT * 0.75;
    g.fillRect(PLAY.left, top, PLAY_WIDTH, PLAY.bottom - top);
    g.lineStyle(1.5, 0xffffff, 0.35);
    g.lineBetween(PLAY.left, top, PLAY.right, top);
  } else {
    g.fillRect(PLAY.left, PLAY.top, PLAY_WIDTH, PLAY_HEIGHT);
  }
}

/** 开球区(竖屏下是台面靠玩家这一侧的四分之一) */
export const KITCHEN_TOP = PLAY.top + PLAY_HEIGHT * 0.75;

export function isInKitchen(y: number) {
  return y >= KITCHEN_TOP - BALL_R;
}

function diamond(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillTriangle(x, y - 3.4, x + 2.4, y, x, y + 3.4);
  g.fillTriangle(x, y - 3.4, x - 2.4, y, x, y + 3.4);
}
