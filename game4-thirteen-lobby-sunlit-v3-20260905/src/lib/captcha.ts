import { deflateSync } from 'node:zlib';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { signValue } from './auth';

/**
 * 图形验证码。
 *
 * 自己手写 PNG 编码,不引任何画图依赖:
 * 服务端画图的库(node-canvas / @napi-rs/canvas)都带原生二进制,
 * 而这个仓库的 node_modules 是 Mac 和 Linux 两台机器共用的,原生包必然在其中一边缺文件。
 * PNG 本身只是 "zlib 压过的扫描行 + 几个带 CRC 的块",Node 自带 zlib 就够了。
 *
 * 验证码答案不落库:把 HMAC(随机 nonce+答案+过期时间) 放进 httpOnly cookie,
 * 校验时比对签名 —— 无状态,也就不需要给它准备一张表或一个 Redis。
 *
 * 纯签名挡不住重放:攻击者 OCR 出一次答案后,可以留着那条 cookie 值在 TTL 内反复提交。
 * 所以每张图带一个 nonce,校验通过就把 nonce 记进内存黑名单,同一张图只能用一次。
 * 这份黑名单跟 rate-limit 一样是**每实例各一份**的尽力而为 —— 但攻击者选不了实例,
 * 配合限流足以把"OCR 一次、注册一百次"堵死。

/** 去掉 0/O/1/I/Z/2 这类看混的字符 */
const CHARSET = '3456789ABCDEFGHKMNPRSTUVWXY';
const WIDTH = 168;
const HEIGHT = 56;
const CODE_LENGTH = 4;
/** 验证码 3 分钟内有效 */
const TTL_SECONDS = 180;

/** 5×7 点阵字模。手写的,只覆盖 CHARSET 里用到的字符 */
const FONT: Record<string, string[]> = {
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
};

export function generateCode(length = CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CHARSET[randomInt(CHARSET.length)];
  return out;
}

// ---------- 画图 ----------

type Canvas = { data: Buffer; width: number; height: number };

function createCanvas(width: number, height: number, rgb: [number, number, number]): Canvas {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = rgb[0];
    data[i * 3 + 1] = rgb[1];
    data[i * 3 + 2] = rgb[2];
  }
  return { data, width, height };
}

function setPixel(canvas: Canvas, x: number, y: number, rgb: [number, number, number]) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
  const offset = (py * canvas.width + px) * 3;
  canvas.data[offset] = rgb[0];
  canvas.data[offset + 1] = rgb[1];
  canvas.data[offset + 2] = rgb[2];
}

function drawLine(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    setPixel(canvas, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rgb);
  }
}

/** 画一个字:点阵放大 + 随机上下位移 + 随机倾斜,让它没法被简单模板匹配 */
function drawGlyph(canvas: Canvas, char: string, originX: number, rgb: [number, number, number]) {
  const glyph = FONT[char];
  if (!glyph) return;
  const scale = 5;
  const baseY = 8 + randomInt(-3, 4);
  const shear = (randomInt(-30, 31) / 100);
  for (let row = 0; row < glyph.length; row++) {
    for (let col = 0; col < glyph[row].length; col++) {
      if (glyph[row][col] !== '#') continue;
      const offsetX = originX + col * scale + (glyph.length - row) * shear * scale * 0.4;
      const offsetY = baseY + row * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) setPixel(canvas, offsetX + dx, offsetY + dy, rgb);
      }
    }
  }
}

export function renderCaptchaPng(code: string): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT, [244, 246, 240]);

  // 背景噪点
  for (let i = 0; i < 900; i++) {
    const tone = randomInt(170, 225);
    setPixel(canvas, randomInt(0, WIDTH), randomInt(0, HEIGHT), [tone, tone - 6, tone - 12]);
  }
  // 干扰线
  for (let i = 0; i < 4; i++) {
    drawLine(
      canvas, randomInt(0, WIDTH), randomInt(0, HEIGHT), randomInt(0, WIDTH), randomInt(0, HEIGHT),
      [randomInt(120, 190), randomInt(120, 190), randomInt(120, 190)],
    );
  }

  const step = Math.floor((WIDTH - 24) / code.length);
  for (let i = 0; i < code.length; i++) {
    drawGlyph(canvas, code[i], 16 + i * step, [randomInt(20, 90), randomInt(20, 90), randomInt(70, 150)]);
  }

  // 前景再补几笔,压在字上面,防止按连通域直接抠字
  for (let i = 0; i < 2; i++) {
    drawLine(
      canvas, 0, randomInt(0, HEIGHT), WIDTH, randomInt(0, HEIGHT),
      [randomInt(90, 160), randomInt(90, 160), randomInt(90, 160)],
    );
  }

  return encodePng(canvas);
}

// ---------- 最小 PNG 编码器 ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typeAndBody = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndBody), 0);
  return Buffer.concat([length, typeAndBody, crc]);
}

function encodePng(canvas: Canvas): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;  // 位深
  ihdr[9] = 2;  // 颜色类型 2 = 真彩色,不带 alpha
  ihdr[10] = 0; // 压缩方法
  ihdr[11] = 0; // 滤波方法
  ihdr[12] = 0; // 隔行扫描:无

  // 每一行前面要加一个滤波类型字节,这里统一用 0(不滤波)
  const stride = canvas.width * 3;
  const raw = Buffer.alloc((stride + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    raw[y * (stride + 1)] = 0;
    canvas.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 无状态校验 ----------

/**
 * 用过的 nonce 黑名单。key 是 nonce,value 是它自己的过期时间(过期即可丢弃)。
 * 上限兜底,避免被大量伪造请求撑爆内存 —— 满了就先清一遍过期的,还满就丢最早的。
 */
const usedNonces = new Map<string, number>();
const MAX_USED_NONCES = 5000;

function sweepNonces() {
  const now = Date.now();
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

function consumeNonce(nonce: string, expiresAt: number): boolean {
  sweepNonces();
  if (usedNonces.has(nonce)) return false;
  if (usedNonces.size >= MAX_USED_NONCES) {
    const oldest = usedNonces.keys().next().value;
    if (oldest !== undefined) usedNonces.delete(oldest);
  }
  usedNonces.set(nonce, expiresAt);
  return true;
}

/** cookie 里存的是 `nonce.过期时间.签名`,答案本身不出现在任何地方 */
export function sealCaptcha(code: string): string {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const nonce = randomBytes(9).toString('base64url');
  return `${nonce}.${expires}.${signValue(`captcha.${nonce}.${code.toUpperCase()}.${expires}`)}`;
}

export function verifyCaptcha(sealed: string | undefined, input: unknown): boolean {
  if (!sealed || typeof input !== 'string') return false;
  // 用户手输的验证码不会超过几个字符,超长直接扔,别拿去做 HMAC
  if (input.length > 16) return false;
  const [nonce, rawExpires, signature] = sealed.split('.');
  if (!nonce || !rawExpires || !signature) return false;
  const expires = Number(rawExpires);
  if (!Number.isInteger(expires) || expires * 1000 < Date.now()) return false;
  const expected = signValue(`captcha.${nonce}.${input.trim().toUpperCase()}.${expires}`);
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  // 签名对了才消费 nonce:答案错的那些尝试不该把这张图作废(否则用户输错一次就得换图)
  return consumeNonce(nonce, expires * 1000);
}

export const CAPTCHA_TTL_SECONDS = TTL_SECONDS;
