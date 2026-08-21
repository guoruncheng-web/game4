/**
 * 将开局动画源图里的洋红头像占位圆转成透明孔。
 * 
 * 用法:
 *   node tools/art/ludo/remove_avatar_chroma.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// v3 将中央骰子从底图中移除；骰子由开局动画中的独立 3D 层负责。
const INPUT = 'src/games/ludo/image/game-start-table-no-dice-v1.png';
const OUTPUT = 'public/ludo/ui/game-start-table-dynamic-v1.png';

const source = readFileSync(INPUT);
let offset = 8;
let width = 0;
let height = 0;
let colorType = 0;
const idat = [];
while (offset < source.length) {
  const length = source.readUInt32BE(offset);
  const type = source.toString('ascii', offset + 4, offset + 8);
  const body = source.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    width = body.readUInt32BE(0);
    height = body.readUInt32BE(4);
    colorType = body[9];
    if (body[8] !== 8 || body[12] !== 0 || ![2, 6].includes(colorType)) {
      throw new Error('只支持 8-bit、非隔行 RGB/RGBA PNG');
    }
  } else if (type === 'IDAT') idat.push(body);
  offset += length + 12;
}

const channels = colorType === 6 ? 4 : 3;
const rowBytes = width * channels;
const packed = inflateSync(Buffer.concat(idat));
const decoded = Buffer.alloc(rowBytes * height);
let inputOffset = 0;
for (let y = 0; y < height; y += 1) {
  const filter = packed[inputOffset++];
  const row = decoded.subarray(y * rowBytes, (y + 1) * rowBytes);
  for (let x = 0; x < rowBytes; x += 1) {
    const raw = packed[inputOffset++];
    const left = x >= channels ? row[x - channels] : 0;
    const up = y ? decoded[(y - 1) * rowBytes + x] : 0;
    const upLeft = y && x >= channels ? decoded[(y - 1) * rowBytes + x - channels] : 0;
    const paeth = (() => {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
      return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
    })();
    row[x] = (raw + [0, left, up, Math.floor((left + up) / 2), paeth][filter]) & 255;
  }
}

const data = Buffer.alloc(width * height * 4);
for (let sourceIndex = 0, targetIndex = 0; sourceIndex < decoded.length; sourceIndex += channels, targetIndex += 4) {
  data[targetIndex] = decoded[sourceIndex];
  data[targetIndex + 1] = decoded[sourceIndex + 1];
  data[targetIndex + 2] = decoded[sourceIndex + 2];
  data[targetIndex + 3] = channels === 4 ? decoded[sourceIndex + 3] : 255;
}

const holes = [
  [0.153, 0.129], [0.847, 0.129],
  [0.153, 0.731], [0.847, 0.731],
];
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const distance = Math.min(...holes.map(([cx, cy]) => Math.hypot(x - cx * width, y - cy * height)));
    const innerRadius = width * 0.068;
    const outerRadius = width * 0.073;
    if (distance < outerRadius) {
      const alpha = distance <= innerRadius ? 0 : Math.round(255 * (distance - innerRadius) / (outerRadius - innerRadius));
      data[(y * width + x) * 4 + 3] = alpha;
    }
  }
}

const scanlines = Buffer.alloc(height * (width * 4 + 1));
for (let y = 0; y < height; y += 1) data.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const chunk = (type, body) => {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, body])) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  name.copy(out, 4);
  body.copy(out, 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 8);
  return out;
};
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
writeFileSync(OUTPUT, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`已生成 ${OUTPUT}`);
