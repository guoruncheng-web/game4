/**
 * 头像图片的服务端校验。
 *
 * **不引 sharp / node-canvas / @napi-rs/canvas**:它们都带原生二进制,
 * 而这个仓库的 node_modules 是 Mac 和 Linux 两台机器共用的,原生包必然在其中一边缺文件
 * (验证码那边手写 PNG 编码器也是同一个原因)。
 *
 * 于是缩放和裁剪全部放在浏览器里用 canvas 做,服务端只做"这坨字节能不能当图片发出去"的把关:
 *   1. 按魔数认格式 —— **不信 Content-Type**,那是客户端随便写的;
 *   2. 卡字节上限 —— 图片要进数据库,也要发给所有看到这个人的客户端;
 *   3. 从文件头解析真实宽高 —— 挡住解压炸弹:20000×20000 的纯色 PNG 压完只有几十 KB,
 *      能过字节数检查,却会让每个渲染它的浏览器吃掉 1GB 以上内存。
 *      注意这一步只读文件头,不解码像素,所以炸弹不会在服务端展开。
 */

/** 上传体积上限。客户端会先压到 256×256 WebP(通常 10–30KB),这个上限是给异常输入留的余量 */
export const MAX_AVATAR_BYTES = 200 * 1024;
/** 客户端输出的边长。服务端不强制等于它,只卡上限 —— 换了压缩参数不必两边同步改 */
export const AVATAR_EDGE = 256;
/** 宽高上限。比 AVATAR_EDGE 宽松一档,容忍客户端用了别的尺寸,但挡死解压炸弹 */
export const MAX_AVATAR_DIMENSION = 512;
export const MIN_AVATAR_DIMENSION = 16;

export type AvatarMime = 'image/webp' | 'image/png' | 'image/jpeg';

export type DecodedAvatar = { mime: AvatarMime; width: number; height: number };

/** 校验失败时返回给前端的中文原因;成功返回图片的真实格式与尺寸 */
export type AvatarCheck =
  | { ok: true; value: DecodedAvatar }
  | { ok: false; error: string };

export function inspectAvatar(bytes: Uint8Array): AvatarCheck {
  if (bytes.byteLength === 0) return { ok: false, error: '没有收到图片内容' };
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return { ok: false, error: `图片太大了,请控制在 ${Math.floor(MAX_AVATAR_BYTES / 1024)}KB 以内` };
  }

  const decoded = readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
  if (!decoded) return { ok: false, error: '只支持 PNG / JPEG / WebP 图片' };

  const { width, height } = decoded;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { ok: false, error: '图片尺寸读不出来,换一张试试' };
  }
  if (width < MIN_AVATAR_DIMENSION || height < MIN_AVATAR_DIMENSION) {
    return { ok: false, error: `图片太小了,至少 ${MIN_AVATAR_DIMENSION}×${MIN_AVATAR_DIMENSION}` };
  }
  if (width > MAX_AVATAR_DIMENSION || height > MAX_AVATAR_DIMENSION) {
    return { ok: false, error: `图片尺寸不能超过 ${MAX_AVATAR_DIMENSION}×${MAX_AVATAR_DIMENSION}` };
  }
  return { ok: true, value: decoded };
}

// ---------------------------------------------------------------- 各格式的文件头

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** PNG:魔数之后第一个块必须是 IHDR,宽高就是它的头 8 个字节(大端) */
function readPng(bytes: Uint8Array): DecodedAvatar | null {
  if (!matches(bytes, 0, PNG_MAGIC)) return null;
  if (bytes.byteLength < 24) return null;
  if (ascii(bytes, 12, 4) !== 'IHDR') return null;
  return { mime: 'image/png', width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

/**
 * JPEG:没有固定位置的尺寸字段,必须顺着 marker 段一路跳到 SOFn。
 * 跳过的段长度自带,所以这是线性扫描,不解码任何压缩数据。
 */
function readJpeg(bytes: Uint8Array): DecodedAvatar | null {
  if (!matches(bytes, 0, [0xff, 0xd8])) return null;
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null; // 段必须以 0xFF 开头,对不上说明文件已经坏了
    const marker = bytes[offset + 1];
    // 0xFF 填充字节:标准允许在段之间塞任意多个,逐个跳过
    if (marker === 0xff) { offset += 1; continue; }
    // 无长度字段的独立 marker(RSTn / SOI / TEM)
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2) return null;
    // SOFn 就是尺寸所在的段。0xC4(DHT)、0xC8、0xCC 名字像 SOF 但不是,必须排掉
    const isSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 >= bytes.byteLength) return null;
      // 段内布局:长度(2) 精度(1) 高(2) 宽(2)
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
      return { mime: 'image/jpeg', width, height };
    }
    // 0xDA(SOS)之后是熵编码数据,再往后扫就没意义了 —— 到这里还没找到 SOF 就是坏文件
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}

/**
 * WebP:RIFF 容器,尺寸在哪取决于第一个块是三种编码里的哪一种。
 * 客户端 canvas 导出的是有损的 VP8,但用户直传时三种都可能遇到。
 */
function readWebp(bytes: Uint8Array): DecodedAvatar | null {
  if (bytes.byteLength < 30) return null;
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(bytes, 12, 4);

  if (chunk === 'VP8 ') {
    // 块头(8) + 帧标签(3) 之后必须是同步码 9D 01 2A,再往后是两个 14 位的宽高
    if (!matches(bytes, 23, [0x9d, 0x01, 0x2a])) return null;
    const width = ((bytes[27] << 8) + bytes[26]) & 0x3fff;
    const height = ((bytes[29] << 8) + bytes[28]) & 0x3fff;
    return { mime: 'image/webp', width, height };
  }

  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return null; // 无损签名
    // 紧随其后的 32 位小端里,低 14 位是 宽-1,接着 14 位是 高-1
    const bits = bytes[21] + (bytes[22] << 8) + (bytes[23] << 16) + (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { mime: 'image/webp', width, height };
  }

  if (chunk === 'VP8X') {
    // 块头(8) + 标志位(4) 之后是两个 24 位小端的 画布边长-1
    const width = (bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)) + 1;
    const height = (bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)) + 1;
    return { mime: 'image/webp', width, height };
  }

  return null;
}
