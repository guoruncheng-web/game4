#!/usr/bin/env python3
"""鱼塘猎手 UI 后期：抠像、alpha bleed、紧裁和等比缩放。"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from process_fish import alpha_bleed, chroma_alpha


MAX_SIZES = {
    "cannon-base": (320, 240),
    "cannon-barrel": (128, 320),
    "hud-player": (512, 144),
    "button-minus": (128, 128),
    "button-plus": (128, 128),
    "alert-dragon": (768, 320),
    "alert-boss": (768, 320),
    "modal-panel": (960, 640),
    "button-back": (160, 160),
    "button-online-lobby": (640, 240),
}


def process(src: Path, dst: Path, max_size: tuple[int, int]) -> None:
    image = Image.open(src).convert("RGBA")
    pixels = np.asarray(image).copy()
    rgb = pixels[..., :3]
    source_alpha = pixels[..., 3]

    # imagegen 偶尔会直接返回透明底；其余素材遵循 ART.md 的纯品红抠像约定。
    if np.any(source_alpha < 255):
        alpha = source_alpha.copy()
    else:
        alpha = chroma_alpha(rgb)
    alpha_bleed(rgb, alpha)

    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        raise ValueError(f"{src}: 抠像后没有可见像素")
    left = max(0, int(xs.min()) - 2)
    top = max(0, int(ys.min()) - 2)
    right = min(rgb.shape[1], int(xs.max()) + 3)
    bottom = min(rgb.shape[0], int(ys.max()) + 3)

    result = Image.fromarray(np.dstack((rgb, alpha))[top:bottom, left:right])
    result.thumbnail(max_size, Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    result.save(dst, "PNG", optimize=True)
    print(f"{src.name}: crop {right-left}x{bottom-top} -> {result.width}x{result.height}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    for name, max_size in MAX_SIZES.items():
        process(args.source / f"{name}.png", args.output / f"{name}.png", max_size)


if __name__ == "__main__":
    main()
