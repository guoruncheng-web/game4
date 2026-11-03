'use client';

import { AVATAR_EDGE, MAX_AVATAR_BYTES } from './avatar';

/**
 * 把用户选的任意图片压成一张能上传的方形头像。
 *
 * 缩放裁剪之所以放在浏览器,而不是传原图上去让服务端处理:服务端做这件事需要
 * sharp / node-canvas 这类原生依赖,而这个仓库的 node_modules 是 Mac 和 Linux
 * 共用的,原生包必然在其中一边缺文件(理由同 `src/lib/avatar.ts` 开头)。
 * 好处是顺带也不用把用户那张 5MB 的原图传上去。
 */

/** 编码格式按这个顺序试,取第一个成功且不超上限的 */
const ENCODINGS: ReadonlyArray<{ mime: string; quality: number }> = [
  { mime: 'image/webp', quality: 0.85 },
  // Safari 14 以下的 canvas 不认 webp。它遇到不支持的类型不会报错,而是**静默回退成 PNG**,
  // 所以下面必须核对 blob.type,不能假定要到什么就得到什么
  { mime: 'image/jpeg', quality: 0.82 },
];

export type EncodedAvatar = { blob: Blob; previewUrl: string };

export async function encodeAvatar(file: File): Promise<EncodedAvatar> {
  if (!file.type.startsWith('image/')) throw new Error('请选择一张图片');
  const source = await loadImage(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_EDGE;
    canvas.height = AVATAR_EDGE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('这个浏览器画不了图,换一个试试');

    // 居中裁成正方形再缩放:直接拉伸到正方形会把人脸压扁
    const edge = Math.min(source.width, source.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      source,
      (source.width - edge) / 2, (source.height - edge) / 2, edge, edge,
      0, 0, AVATAR_EDGE, AVATAR_EDGE,
    );

    for (const { mime, quality } of ENCODINGS) {
      const blob = await toBlob(canvas, mime, quality);
      if (!blob || blob.type !== mime) continue;
      if (blob.size > MAX_AVATAR_BYTES) continue;
      return { blob, previewUrl: URL.createObjectURL(blob) };
    }
    throw new Error('这张图压不下来,换一张试试');
  } finally {
    if (source instanceof ImageBitmap) source.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => { canvas.toBlob(resolve, mime, quality); });
}

/**
 * 解码用户选的文件。
 *
 * 优先 `createImageBitmap` 并显式要 `from-image`:手机拍的照片方向记在 EXIF 里,
 * 不带这个选项画出来的头像会是躺着的。老浏览器没有这个 API 时退回 <img>,
 * 那条路上浏览器自己会按 EXIF 摆正(现代浏览器的默认行为)。
 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // 有些浏览器不认 imageOrientation 选项,直接抛错 —— 掉到下面的 <img> 分支
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('这个文件不是有效的图片'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
