#!/usr/bin/env python3
"""鱼素材后期：品红抠像 → alpha bleed → 紧裁 → Lanczos 缩放。"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


SIZES = {
    "clown": (176, 132),
    "blue": (208, 156),
    "puffer": (240, 180),
    "turtle": (304, 228),
    "ray": (352, 264),
    "shark": (416, 312),
    "dragon": (800, 400),
    "boss": (1040, 780),
}


def chroma_alpha(rgb: np.ndarray) -> np.ndarray:
    """按品红通道优势生成柔和 alpha，并清理边缘品红溢色。"""
    work = rgb.astype(np.float32)
    red, green, blue = work[..., 0], work[..., 1], work[..., 2]
    key_strength = np.minimum(red, blue)
    non_key = green
    dominance = np.maximum(0.0, key_strength - non_key)
    denominator = np.maximum(1.0, 255.0 - non_key)
    alpha = np.clip(1.0 - dominance / denominator, 0.0, 1.0)

    # 纯背景必须彻底透明；柔边保留半透明，避免缩小时出现锯齿。
    distance = np.maximum.reduce([np.abs(red - 255.0), np.abs(green), np.abs(blue - 255.0)])
    soft = np.clip((distance - 10.0) / 86.0, 0.0, 1.0)
    alpha = np.minimum(alpha, soft)

    # ART.md 约定：品红附近按 HSV 色相 ±12° 直接视为背景。
    maximum = np.maximum.reduce([red, green, blue])
    minimum = np.minimum.reduce([red, green, blue])
    delta = maximum - minimum
    hue = np.zeros_like(maximum)
    nonzero = delta > 0
    red_max = nonzero & (maximum == red)
    green_max = nonzero & (maximum == green)
    blue_max = nonzero & (maximum == blue)
    hue[red_max] = 60.0 * np.mod((green[red_max] - blue[red_max]) / delta[red_max], 6.0)
    hue[green_max] = 60.0 * ((blue[green_max] - red[green_max]) / delta[green_max] + 2.0)
    hue[blue_max] = 60.0 * ((red[blue_max] - green[blue_max]) / delta[blue_max] + 4.0)
    saturation = np.divide(delta, maximum, out=np.zeros_like(delta), where=maximum > 0)
    hue_distance = np.minimum(np.abs(hue - 300.0), 360.0 - np.abs(hue - 300.0))
    chroma = (hue_distance <= 12.0) & (saturation >= 0.55) & (maximum >= 128.0)
    alpha[chroma] = 0.0
    alpha[alpha < 8.0 / 255.0] = 0.0

    partial = alpha < 0.99
    cap = np.maximum(0.0, green - 1.0)
    work[..., 0][partial] = np.minimum(work[..., 0][partial], cap[partial])
    work[..., 2][partial] = np.minimum(work[..., 2][partial], cap[partial])
    rgb[:] = np.clip(work, 0, 255).astype(np.uint8)
    return np.round(alpha * 255.0).astype(np.uint8)


def alpha_bleed(rgb: np.ndarray, alpha: np.ndarray, iterations: int = 8) -> None:
    """把透明区 RGB 用邻近可见像素外扩，防止 Lanczos 采到品红。"""
    filled = alpha > 0
    height, width = filled.shape
    for _ in range(iterations):
        sums = np.zeros((height, width, 3), dtype=np.uint32)
        counts = np.zeros((height, width), dtype=np.uint16)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                src_y = slice(max(0, -dy), min(height, height - dy))
                src_x = slice(max(0, -dx), min(width, width - dx))
                dst_y = slice(max(0, dy), min(height, height + dy))
                dst_x = slice(max(0, dx), min(width, width + dx))
                mask = filled[src_y, src_x]
                sums[dst_y, dst_x] += rgb[src_y, src_x].astype(np.uint32) * mask[..., None]
                counts[dst_y, dst_x] += mask
        grow = (~filled) & (counts > 0)
        if not np.any(grow):
            break
        rgb[grow] = (sums[grow] / counts[grow, None]).astype(np.uint8)
        filled[grow] = True


def process(src: Path, dst: Path, size: tuple[int, int]) -> None:
    image = Image.open(src).convert("RGB")
    rgb = np.asarray(image).copy()
    alpha = chroma_alpha(rgb)
    alpha_bleed(rgb, alpha)

    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        raise ValueError(f"{src}: 抠像后没有可见像素")
    left = max(0, int(xs.min()) - 2)
    top = max(0, int(ys.min()) - 2)
    right = min(rgb.shape[1], int(xs.max()) + 3)
    bottom = min(rgb.shape[0], int(ys.max()) + 3)

    rgba = np.dstack((rgb, alpha))[top:bottom, left:right]
    result = Image.fromarray(rgba).resize(size, Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    result.save(dst, "PNG", optimize=True)
    print(f"{src.name}: crop {right-left}x{bottom-top} -> {size[0]}x{size[1]} ({dst})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="输出尺寸倍率；模型贴图建议用 4，游戏内 2D 素材保持默认 1",
    )
    args = parser.parse_args()
    for kind, size in SIZES.items():
        scaled = tuple(max(1, round(value * args.scale)) for value in size)
        process(args.source / f"{kind}.png", args.output / f"{kind}.png", scaled)


if __name__ == "__main__":
    main()
