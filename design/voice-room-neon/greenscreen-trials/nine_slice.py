"""把绿幕素材生产化：裁到内容边界 → 缩放到目标尺寸 → 计算九宫格边距。

三个关键决定：

1. ALPHA_FLOOR=16 而不是 2。个别素材（button.capsule.gold）背景残留了 alpha 1~8 的
   微弱值，用低阈值裁 bbox 会得到整张画布。alpha<16 的像素透明度不足 6%，肉眼不可见，
   切掉它们对视觉无影响，却能让 bbox 稳定。

2. 按高度缩放到概念稿尺寸。概念稿画布 768 宽对应真机 393 CSS 像素（比例 1.954≈2），
   所以概念稿里的 box 尺寸正好≈2x CSS 尺寸，适配 2x DPR 屏幕。宽度不强行对齐——
   九宫格件靠拉伸适配宽度，比例不一致是正常的。

3. 边距 = 外发光带宽 + 圆角半径。先用 alpha>96 分出"实体"（描边+底面），实体到裁剪边界
   的距离就是外发光带；再在实体掩码上沿中线扫描，找垂直跨度达到 97% 最大值的位置作为
   圆角结束点。两者相加，保证拉伸只作用在中间直边区，圆角和描边不变形。

输出：greenscreen-final/<slot>.png + nine_slice.json
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slots import SLOTS  # noqa: E402

HERE = Path(__file__).resolve().parent
DESIGN = HERE.parent
SRC = DESIGN / "greenscreen-assets"
OUT = DESIGN / "greenscreen-final"

ALPHA_FLOOR = 16
SOLID = 96
PLATEAU = 0.97

NINE_SLICE = {
    "button-capsule-gold", "button-capsule-red", "button-capsule-disabled",
    "row-bubble-bg", "input-field", "panel-frame-ornate",
    "pill-status-gold", "pill-status-red", "pill-role-badge", "pill-count-small",
    "seat-nametag", "button-tile-neutral", "button-tile-warning",
    "card-game-frame", "panel-header-room-info",
}


def ref_tile_size(ref: str):
    """从 cutouts manifest 反查该槽位参考 tile 在概念稿里的尺寸（= 2x CSS 目标尺寸）。"""
    m = re.match(r"cutouts/([^/]+)/(.+)\.png$", ref)
    if not m:
        return None
    mf = DESIGN / "cutouts" / m.group(1) / "manifest.json"
    if not mf.exists():
        return None
    for item in json.loads(mf.read_text(encoding="utf-8")):
        if item["name"] == m.group(2):
            return tuple(item["size_px"])
    return None


def slice_margins(alpha: np.ndarray):
    solid = alpha > SOLID
    if not solid.any():
        return 1, 1, 1, 1
    ys, xs = np.where(solid)
    h, w = alpha.shape
    glow_l, glow_t = int(xs.min()), int(ys.min())
    glow_r, glow_b = w - 1 - int(xs.max()), h - 1 - int(ys.max())

    sub = solid[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    col = sub.sum(axis=0)
    row = sub.sum(axis=1)

    def corner(span):
        hit = np.where(span >= span.max() * PLATEAU)[0]
        return int(hit[0]) if len(hit) else 0

    t = glow_t + corner(row)
    b = glow_b + corner(row[::-1])
    l = glow_l + corner(col)
    r = glow_r + corner(col[::-1])

    # 留至少 2px 可拉伸带
    t, b = min(t, (h - 2) // 2), min(b, (h - 2) // 2)
    l, r = min(l, (w - 2) // 2), min(r, (w - 2) // 2)
    return max(t, 1), max(r, 1), max(b, 1), max(l, 1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    chosen = {}
    for p in sorted(SRC.glob("*.png")):
        chosen.setdefault(p.stem.rsplit("_", 1)[0], p)

    manifest = []
    for slot_file, path in sorted(chosen.items()):
        slot_key = slot_file.replace("-", ".", 0)  # 仅用于查 SLOTS
        cfg = next((v for k, v in SLOTS.items() if k.replace(".", "-") == slot_file), None)

        im = Image.open(path).convert("RGBA")
        a = np.asarray(im)[..., 3]
        ys, xs = np.where(a > ALPHA_FLOOR)
        im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

        target = ref_tile_size(cfg["ref"]) if cfg else None
        note = ""
        if target:
            scale = target[1] / im.height          # 按高度对齐
            new_size = (max(round(im.width * scale), 2), target[1])
            im = im.resize(new_size, Image.LANCZOS)
        else:
            note = "参考图不是 cutouts tile（概念稿缺失槽位），尺寸保持裁剪结果，替换时按需调整"

        im.save(OUT / f"{slot_file}.png")
        entry = {
            "slot": slot_file,
            "source": path.name,
            "size": list(im.size),
            "type": "SLICED" if slot_file in NINE_SLICE else "SIMPLE",
        }
        if note:
            entry["note"] = note
        if slot_file in NINE_SLICE:
            t, r, b, l = slice_margins(np.asarray(im)[..., 3])
            entry["slice_px"] = {"top": t, "right": r, "bottom": b, "left": l}
            entry["css"] = (f"border-image: url('{slot_file}.png') {t} {r} {b} {l} fill stretch;"
                            f" border-style: solid; border-width: {t}px {r}px {b}px {l}px;")
        manifest.append(entry)

    (OUT / "nine_slice.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    sliced = [m for m in manifest if m["type"] == "SLICED"]
    print(f"生产化完成：{len(manifest)} 个槽位 → {OUT.name}/")
    print(f"  九宫格件 {len(sliced)}，SIMPLE 件 {len(manifest)-len(sliced)}\n")
    for m in sliced:
        s, (w, h) = m["slice_px"], m["size"]
        ok = "" if s["left"] + s["right"] < w and s["top"] + s["bottom"] < h else "  ⚠ 边距过大"
        print(f"  {m['slot']:26s} {w:4d}x{h:<4d} slice T{s['top']:3d} R{s['right']:3d} "
              f"B{s['bottom']:3d} L{s['left']:3d}{ok}")
    for m in manifest:
        if m.get("note"):
            print(f"\n  注意 {m['slot']}: {m['note']}")


if __name__ == "__main__":
    main()
