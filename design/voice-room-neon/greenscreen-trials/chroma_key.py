"""绿幕抠图 + 去溢色 + 质量断言。

色键判据用"绿色主导度" G - max(R,B)，比固定阈值更耐受绿幕本身的明暗不均。
去溢色只作用于半透明边缘像素，把溢出的绿压回 R/B 的水平，避免金色描边发绿。
最后强制清零全透明像素的 RGB（项目标准：transparent_nonzero_rgb 必须为 0）。

用法: python3 chroma_key.py <in.png> <out.png>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LOW, HIGH = 40, 130          # 绿色主导度阈值：<=LOW 全不透明，>=HIGH 全透明


def chroma_key(path_in: Path, path_out: Path) -> dict:
    rgb = np.asarray(Image.open(path_in).convert("RGB")).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    dominance = g - np.maximum(r, b)
    alpha = np.clip((HIGH - dominance) / (HIGH - LOW), 0.0, 1.0)

    # 从四角采样实际绿幕颜色（不假设正好是 #00FF00，模型画出来会有偏差和噪点）
    corners = np.concatenate([
        rgb[:24, :24].reshape(-1, 3), rgb[:24, -24:].reshape(-1, 3),
        rgb[-24:, :24].reshape(-1, 3), rgb[-24:, -24:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0).astype(np.float32)

    # unpremultiply：观察色 = alpha*前景 + (1-alpha)*绿幕 → 反解前景色。
    # 半透明边缘（外发光）就是靠这一步把混进来的绿幕去掉的。
    a = alpha[..., None].astype(np.float32)
    out = np.where(a > 0.004, (rgb.astype(np.float32) - (1.0 - a) * bg) / np.maximum(a, 0.004), 0.0)

    # 兜底：反解后若仍绿色占优（模型自身画的绿边），把 G 压到 R/B 的较大值
    cap = np.maximum(out[..., 0], out[..., 2])
    out[..., 1] = np.minimum(out[..., 1], np.maximum(cap, 0))

    a8 = (alpha * 255).round().astype(np.uint8)
    out8 = np.clip(out, 0, 255).astype(np.uint8)
    out8[a8 == 0] = 0                      # 全透明像素 RGB 清零

    rgba = np.dstack([out8, a8])
    Image.fromarray(rgba, "RGBA").save(path_out)

    transparent = a8 == 0
    semi = (a8 > 0) & (a8 < 255)
    opaque = a8 == 255
    # 残留绿：按【处理后】的像素判断，凡是可见像素里绿色仍明显占优的都算溢色残留
    out_dom = out8[..., 1].astype(np.int16) - np.maximum(out8[..., 0], out8[..., 2]).astype(np.int16)
    residual_green = int(((a8 > 0) & (out_dom > 15)).sum())
    return {
        "size": f"{rgba.shape[1]}x{rgba.shape[0]}",
        "transparent_pct": round(float(transparent.mean()) * 100, 1),
        "semi_pct": round(float(semi.mean()) * 100, 1),
        "opaque_pct": round(float(opaque.mean()) * 100, 1),
        "transparent_nonzero_rgb": int((transparent & (out8.sum(axis=2) > 0)).sum()),
        "residual_green_px": residual_green,
        "touches_edge": bool(
            a8[0, :].max() > 0 or a8[-1, :].max() > 0 or a8[:, 0].max() > 0 or a8[:, -1].max() > 0
        ),
    }


if __name__ == "__main__":
    stats = chroma_key(Path(sys.argv[1]), Path(sys.argv[2]))
    print(Path(sys.argv[1]).name)
    for k, v in stats.items():
        print(f"  {k}: {v}")
