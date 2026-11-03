#!/usr/bin/env python3
"""黑底游戏素材抠像:背景纯黑(非品红)时,用 亮度阈值 + 四角 flood fill 抠出主体。
主体内部的暗色(金属暗部)不会连到角落,flood fill 不会误伤。"""

from __future__ import annotations
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from process_fish import alpha_bleed  # 复用品红管线的 bleed

BG_LUMA = 14  # 低于此亮度视为背景候选


def bg_alpha(rgb: np.ndarray) -> np.ndarray:
    """从四角 flood fill 出背景区域(亮度 < BG_LUMA 且连到角落)。"""
    h, w, _ = rgb.shape
    luma = rgb.mean(axis=2)
    bg = luma < BG_LUMA

    # BFS 从四角扩散,只走 bg 像素
    visited = np.zeros((h, w), dtype=bool)
    stack = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or visited[y, x] or not bg[y, x]:
            continue
        visited[y, x] = True
        stack.append((y + 1, x))
        stack.append((y - 1, x))
        stack.append((y, x + 1))
        stack.append((y, x - 1))

    # 背景区全透明;主体区按亮度做 4..12 的羽化,保留边缘抗锯齿过渡
    soft = np.clip((luma - 4.0) / 8.0, 0.0, 1.0)
    alpha = np.where(visited, 0.0, soft)
    alpha[alpha < 8.0 / 255.0] = 0.0
    return np.round(alpha * 255.0).astype(np.uint8)


def process(src: Path, dst: Path, max_size: tuple[int, int]) -> None:
    image = Image.open(src).convert("RGB")
    rgb = np.asarray(image).copy()
    alpha = bg_alpha(rgb)
    alpha_bleed(rgb, alpha)

    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        raise ValueError(f"{src}: 抠像后没有可见像素")
    left = max(0, int(xs.min()) - 2)
    top = max(0, int(ys.min()) - 2)
    right = min(rgb.shape[1], int(xs.max()) + 3)
    bottom = min(rgb.shape[0], int(ys.max()) + 3)

    rgba = np.dstack((rgb, alpha))[top:bottom, left:right]
    result = Image.fromarray(rgba)
    result.thumbnail(max_size, Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    result.save(dst, "PNG", optimize=True)
    print(f"{src.name}: {right-left}x{bottom-top} -> {result.width}x{result.height} ({dst})")


if __name__ == "__main__":
    process(Path(sys.argv[1]), Path(sys.argv[2]), (320, 240))
