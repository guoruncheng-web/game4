/** 摆球与开球点。单独放一个文件,物理内核和 AI 都不需要知道"一局怎么开始"。 */
import { BALL_R, BREAK_SPOT, RACK_APEX } from './config';
import { createBall, nearestFreeSpot, type Ball } from './physics';

/**
 * 标准三角摆:顶点朝母球,黑八在第三排正中,底排两角一全色一花色。
 * 其余位置打乱 —— 每局开出来的球形不一样,开球才有重玩价值。
 */
export function createRack(): Ball[] {
  const spacing = BALL_R * 2 + 0.4;
  const rowGap = spacing * Math.sqrt(3) / 2;

  const solids = shuffle([2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);
  // 顶点固定 1 号,底排两角一边一个组,是国际通行的摆法
  const layout: number[] = [
    1,
    solids[0], stripes[0],
    stripes[1], 8, solids[1],
    solids[2], stripes[2], solids[3], stripes[3],
    stripes[4], solids[4], stripes[5], solids[5], stripes[6],
  ];

  const balls: Ball[] = [createBall(0, BREAK_SPOT.x, BREAK_SPOT.y)];
  let index = 0;
  for (let row = 0; row < 5; row++) {
    // 顶点在下(靠近母球),整个三角往上摊开
    const y = RACK_APEX.y - row * rowGap;
    const x0 = RACK_APEX.x - (row * spacing) / 2;
    for (let i = 0; i <= row; i++) {
      balls.push(createBall(layout[index], x0 + i * spacing, y));
      index += 1;
    }
  }
  return balls;
}

/** 黑八被开球打进时摆回台面 */
export function respotEight(balls: Ball[]) {
  const eight = balls.find((b) => b.id === 8);
  if (!eight) return;
  const spot = nearestFreeSpot(balls, RACK_APEX.x, RACK_APEX.y, 8);
  eight.potted = false;
  eight.vx = 0;
  eight.vy = 0;
  eight.x = spot.x;
  eight.y = spot.y;
}

function shuffle<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
