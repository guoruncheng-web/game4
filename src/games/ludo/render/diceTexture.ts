/**
 * 骰子的六个面。**纯 canvas 2D,不依赖渲染引擎**(和 boardTexture 同一层)。
 *
 * 为什么不用 Phaser 的 Graphics 画:**Graphics 没有渐变填充和径向渐变**,
 * 只能铺纯色。而骰子的立体感几乎全来自三样东西 —— 面上的渐变、边缘的高光、
 * 点位的球面凹陷。用纯色画出来就是"白方块 + 黑圆点",怎么调都是平的。
 *
 * 立体感的构成(从下往上叠):
 *   1. 落地阴影
 *   2. 侧面:往右下偏移一点的深色圆角块,充当"厚度"
 *   3. 正面:左上亮、右下暗的斜向渐变
 *   4. 内圈高光:沿左上边缘的一道亮边(塑料/骨质骰子的反光)
 *   5. 点位:每个点是一个带内阴影和小高光的凹球,不是实心圆
 */

/** 贴图边长。骰子在屏幕上约 50px,2 倍屏留足余量 */
export const DIE_PX = 160;

const SPOTS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.3], [0.7, 0.7]],
  3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
  6: [[0.3, 0.28], [0.7, 0.28], [0.3, 0.5], [0.7, 0.5], [0.3, 0.72], [0.7, 0.72]],
};

export function drawDieCanvas(face: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = DIE_PX;
  canvas.height = DIE_PX;
  const ctx = canvas.getContext('2d')!;

  const pad = DIE_PX * 0.09;
  const size = DIE_PX - pad * 2;
  const depth = DIE_PX * 0.055;
  const radius = size * 0.22;

  // 1) 落地阴影
  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.fillStyle = 'rgba(8,16,40,.38)';
  ctx.beginPath();
  ctx.ellipse(DIE_PX / 2, pad + size * 0.98, size * 0.44, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2) 侧面:往右下偏,当作骰子的厚度
  ctx.beginPath();
  ctx.roundRect(pad + depth * 0.7, pad + depth, size, size, radius);
  ctx.fillStyle = '#9aa3b8';
  ctx.fill();

  // 3) 正面:斜向渐变。左上亮、右下暗 —— 和棋盘金边、棋子高光的受光方向保持一致
  const face3d = ctx.createLinearGradient(pad, pad, pad + size, pad + size);
  face3d.addColorStop(0, '#ffffff');
  face3d.addColorStop(0.55, '#f4f6fb');
  face3d.addColorStop(1, '#d3d8e6');
  ctx.beginPath();
  ctx.roundRect(pad, pad, size, size, radius);
  ctx.fillStyle = face3d;
  ctx.fill();

  // 4) 内圈高光:只描左上那半圈
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pad + 3, pad + 3, size - 6, size - 6, radius * 0.9);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = DIE_PX * 0.035;
  ctx.beginPath();
  ctx.roundRect(pad + 2, pad + 2, size - 4, size - 4, radius);
  ctx.stroke();
  ctx.restore();
  // 右下压一道暗边,把厚度收住
  ctx.strokeStyle = 'rgba(90,100,125,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pad + 1, pad + 1, size - 2, size - 2, radius);
  ctx.stroke();

  // 5) 点位:凹进去的小球,不是实心圆
  const r = size * 0.082;
  for (const [u, v] of SPOTS[face] ?? SPOTS[1]) {
    const x = pad + u * size;
    const y = pad + v * size;
    // 凹坑的内阴影:上缘暗、下缘亮
    const pit = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
    pit.addColorStop(0, '#4b5570');
    pit.addColorStop(0.65, '#232c44');
    pit.addColorStop(1, '#11182b');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pit;
    ctx.fill();
    // 下缘的一点反光,凹感就是它给的
    ctx.beginPath();
    ctx.arc(x + r * 0.28, y + r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fill();
  }

  return canvas;
}
