import * as THREE from 'three';
import { PALETTE } from '../config';

/**
 * 台呢 / 库边木 / 地板的贴图 —— 全部在运行时算出来,不读任何图片文件。
 *
 * 为什么不用 AI 出图:这三种都是**规则纹理**(各向同性绒面、单方向年轮、几何拼花),
 * 正好是程序化的强项。第一版确实让 AI 出过,拿回来的三张是「镜像四拼」的假无缝 ——
 * 右半是左半的逐像素翻转,平铺到 1.27×2.54m 的台面上会看到一格一格的蝴蝶花纹,
 * 比接缝还难看,而且有效分辨率只有一半。四张 PNG 还要占 7.8MB。
 * 真正值得用 AI 的是 env.webp 那种「看不清细节反而更好」的全景反射图,它留下了。
 *
 * 无缝是**数学保证**的,不是事后拼的:
 * - 噪声用可平铺 value noise,格点索引 mod 网格数,首尾天然接得上;
 * - 年轮用整数频率的 sin,一个周期正好铺满一张图;
 * - 人字拼花的完整重复单元 2*M*W 严格整除贴图边长。
 *
 * 三张贴图加起来的生成开销在加载时一次性付掉,之后就是纯 GPU 采样。
 */

/** 贴图边长。台呢会被 repeat 铺满台面,512 足够,再大只是浪费首屏时间 */
const SIZE = 512;

// ---------------------------------------------------------------- 可平铺噪声

/** 定种子 PRNG。贴图必须每次跑出一模一样的结果,不能用 Math.random */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 可平铺 value noise:在 nx×ny 的格点上取随机值,双三次平滑插值。
 * 关键是取格点时 `% nx` / `% ny` —— 右边缘取的就是左边缘那一列格点,所以天然无缝。
 */
function vnoise(nx: number, ny: number, seed: number): Float32Array {
  const rand = rng(seed);
  const grid = new Float32Array(nx * ny);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const v = (y / SIZE) * ny;
    const j0 = Math.floor(v) % ny;
    const j1 = (j0 + 1) % ny;
    const fv = v - Math.floor(v);
    const sv = fv * fv * (3 - 2 * fv);
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * nx;
      const i0 = Math.floor(u) % nx;
      const i1 = (i0 + 1) % nx;
      const fu = u - Math.floor(u);
      const su = fu * fu * (3 - 2 * fu);
      const a = grid[j0 * nx + i0];
      const b = grid[j0 * nx + i1];
      const c = grid[j1 * nx + i0];
      const d = grid[j1 * nx + i1];
      out[y * SIZE + x] = (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
    }
  }
  return out;
}

/** 多八度叠加,输出归一到 ±1。每层格点翻倍,周期不变,所以叠完还是无缝 */
function fbm(nx: number, ny: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  let amp = 1;
  let total = 0;
  for (let k = 0; k < octaves; k++) {
    const layer = vnoise(nx * 2 ** k, ny * 2 ** k, seed + k * 17);
    for (let i = 0; i < out.length; i++) out[i] += amp * layer[i];
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / total) * 2 - 1;
  return out;
}

// ---------------------------------------------------------------- 画布工具

function hex(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

/** 按 t∈[0,1] 在两色之间插值,逐像素写进 ImageData */
function paint(
  from: number, to: number, at: (x: number, y: number, i: number) => number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(SIZE, SIZE);
  const [r0, g0, b0] = hex(from);
  const [r1, g1, b1] = hex(to);
  for (let y = 0, i = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, i++) {
      const t = Math.min(1, Math.max(0, at(x, y, i)));
      image.data[i * 4] = r0 + (r1 - r0) * t;
      image.data[i * 4 + 1] = g0 + (g1 - g0) * t;
      image.data[i * 4 + 2] = b0 + (b1 - b0) * t;
      image.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function toTexture(canvas: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  // 颜色贴图要标 sRGB,数据贴图(法线/粗糙度)绝对不能标 —— 标了会被做一次伽马,数值全错
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- 台呢

/**
 * 台呢:各向同性的细绒 + 一点点经纬织向 + 大尺度深浅。
 * 三层缺一不可 —— 只有细绒会显得像磨砂塑料,只有大块会显得像刷了漆。
 */
export function makeClothTexture(repeat = 3): THREE.CanvasTexture {
  const fine = fbm(64, 64, 3, 1);
  const patch = fbm(8, 8, 2, 2);
  const weave = fbm(96, 24, 1, 3);
  return toTexture(
    paint(PALETTE.clothDark, 0x2c9463,
      (_x, _y, i) => 0.5 + 0.10 * fine[i] + 0.07 * patch[i] + 0.05 * weave[i]),
    repeat, true,
  );
}

// ---------------------------------------------------------------- 库边木

/**
 * 库边硬木。
 *
 * 年轮不能拿 sin 直接当明暗 —— 那样出来是一片软绵绵的宽条纹,像布帘。
 * 真实木材的晚材是**细**深线,所以这里用「到年轮线的距离」做一条窄带:
 * 只有贴着线的一小条压暗,其余是宽阔的早材。
 *
 * 扰动幅度必须远小于年轮周期(这里频率 5、周期 0.2,扰动 0.035 ≈ 17%),
 * 否则年轮会被扭成漩涡,糊成迷彩。
 */
export function makeWoodTexture(repeat = 1): THREE.CanvasTexture {
  const warpA = fbm(6, 2, 2, 5);
  const warpB = fbm(16, 4, 1, 6);
  const fiber = fbm(160, 10, 3, 7);
  const pore = fbm(48, 6, 2, 8);
  return toTexture(
    paint(0x3a1a0c, 0xa0632f, (x, _y, i) => {
      const warp = warpA[i] * 0.035 + warpB[i] * 0.008;
      const d = Math.abs(Math.sin(Math.PI * (5 * (x / SIZE) + warp)));
      const edge = Math.min(1, Math.max(0, 1 - d / 0.30)) ** 1.6;
      return 0.74 - 0.42 * edge + 0.075 * fiber[i] + 0.040 * pore[i];
    }),
    repeat, true,
  );
}

// ---------------------------------------------------------------- 地板

/** 人字拼花的板宽,以及板长 = M 倍板宽。2*M*W 必须整除 SIZE,否则拼花接不上 */
const PLANK_W = 32;
const PLANK_M = 8;

/**
 * 台子底下的地板。只做氛围,但人字拼花比纯色板有说服力得多。
 *
 * 板缝不靠画网格线,而是「相邻像素属于不同板」时压暗 —— 用环绕比较,
 * 所以缝本身也跟着无缝。
 */
export function makeFloorTexture(repeat = 4): THREE.CanvasTexture {
  const period = 2 * PLANK_M;
  const fiber = fbm(24, 6, 3, 9);

  // 先算出每个像素属于哪块板
  const pid = new Int32Array(SIZE * SIZE);
  for (let y = 0, i = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, i++) {
      const a = Math.floor(x / PLANK_W);
      const b = Math.floor(y / PLANK_W);
      const t = ((a - b) % period + period) % period;
      const horiz = t < PLANK_M;
      // 水平板由(起始 a, b)定,垂直板由(a, 起始 b)定;都对周期取模才能保证平铺
      const a0 = (((horiz ? a - t : a) % period) + period) % period;
      const b0 = (((horiz ? b : b - (period - 1 - t)) % period) + period) % period;
      pid[i] = (a0 * 61 + b0 * 7919 + (horiz ? 13 : 0)) % 4096;
    }
  }

  const canvas = paint(0x160f0a, 0x5c4029, (_x, _y, i) => {
    // 每块板一个稳定的随机色调,免得整片地板一个颜色
    const tone = ((Math.imul(pid[i], 0x9e3779b1) >>> 0) % 1000) / 1000;
    return 0.34 + 0.32 * tone + 0.20 * fiber[i];
  });

  // 板缝:和上一行/上一列比,不同板就压暗。索引环绕,缝也就无缝
  const ctx = canvas.getContext('2d')!;
  const image = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let y = 0, i = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, i++) {
      const up = pid[((y - 1 + SIZE) % SIZE) * SIZE + x];
      const left = pid[y * SIZE + ((x - 1 + SIZE) % SIZE)];
      if (pid[i] !== up || pid[i] !== left) {
        image.data[i * 4] *= 0.42;
        image.data[i * 4 + 1] *= 0.42;
        image.data[i * 4 + 2] *= 0.42;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, repeat, true);
}
