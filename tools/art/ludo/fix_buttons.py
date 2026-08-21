"""把生成出来的按钮图裁成干净的单个按钮。

    python3 tools/art/ludo/fix_buttons.py <public/ludo/ui 目录>

**为什么需要这一步。** 出图模型经常在一张图里画不止一个按钮(或者把按钮顶到画布边缘
被截断)。原始素材实测:
    button-yellow  含 2 个按钮        button-green   含 2 个按钮
    button-purple  上半截被切掉        button-disabled 下半截被切掉
直接拿去当背景拉伸,表现就是"按钮下面莫名其妙多一条绿边""圆角被压扁"。

做法:按 alpha 逐行统计,找出图里最大的那一块连续区域,再按它的紧包围盒裁出来,
四周补 2px 透明边(避免缩放时边缘被采样掉)。裁完的图**宽高比就是按钮的真实比例**,
接入时用 border-image 九宫格,任意尺寸都不变形。

**有些图裁不出来。** 如果按钮在原图里就贴着画布边缘被截断(实测 button-green 和
button-disabled 的上半圈金边根本不存在),裁剪救不回来 —— 源像素就没有。
这时脚本会**从一张完好的按钮改色重建**:形状必然和其它按钮一致(本来就该一致),
比重新出一次图更可靠,也不会出现五颗按钮五个形状。

原图会先备份到同目录的 `raw/` 下,重跑不会二次裁剪。
"""

import colorsys
import os
import shutil
import sys

from PIL import Image

UI_DIR = sys.argv[1] if len(sys.argv) > 1 else "public/ludo/ui"
RAW_DIR = os.path.join(UI_DIR, "raw")
PAD = 2


def blocks_of(im):
    """按行找出图里的若干块不透明区域,返回 [(y0, y1), ...]"""
    w, h = im.size
    px = im.load()
    rows = [sum(1 for x in range(0, w, 3) if px[x, y][3] > 16) for y in range(h)]
    peak = max(rows) if rows else 0
    thr = peak * 0.12
    out, start = [], None
    for y, v in enumerate(rows):
        if v > thr and start is None:
            start = y
        elif v <= thr and start is not None:
            if y - start > 8:
                out.append((start, y - 1))
            start = None
    if start is not None and h - start > 8:
        out.append((start, h - 1))
    return out


def recolor(im, hue=None, gray=False):
    """把按钮的**胶囊主体**换个颜色,金边原样留着。

    靠色相区分:金边是暖色(大约 20°~60°),主体是冷色。只改主体那部分的色相,
    金边、白色高光和阴影都不动 —— 整张图统一旋转色相会把金边也变成绿的。
    """
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hh * 360
            is_rim = 15 <= deg <= 65 and ss > 0.35
            if is_rim:
                continue
            if gray:
                # 禁用态:主体去饱和 + 压暗,金边保留但也降一档,否则会显得比可用状态还醒目
                ss2 = ss * 0.12
                vv2 = vv * 0.82
                nr, ng, nb = colorsys.hsv_to_rgb(hh, ss2, vv2)
            else:
                nr, ng, nb = colorsys.hsv_to_rgb(hue / 360, ss, vv)
            px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return out


def rim_to_gray(im):
    """禁用态连金边一起压成灰色"""
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            nr, ng, nb = colorsys.hsv_to_rgb(0.58, ss * 0.15, vv * 0.85)
            px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return out


def crop_main(path):
    im = Image.open(path).convert("RGBA")
    blocks = blocks_of(im)
    if not blocks:
        return None
    # 取最高的那一块 —— 主按钮总是画得最大的那个
    y0, y1 = max(blocks, key=lambda b: b[1] - b[0])
    truncated = y0 <= 1 or y1 >= im.height - 2
    w, _ = im.size
    px = im.load()
    xs = [x for x in range(w) if any(px[x, y][3] > 16 for y in range(y0, y1 + 1, 3))]
    if not xs:
        return None
    x0, x1 = xs[0], xs[-1]
    box = (max(0, x0 - PAD), max(0, y0 - PAD), min(im.width, x1 + 1 + PAD), min(im.height, y1 + 1 + PAD))
    return im.crop(box), len(blocks), truncated


# 截断的按钮从哪张重建、重建成什么颜色
REBUILD = {
    "button-green.png": dict(hue=112),
    "button-disabled.png": dict(gray=True),
}
DONOR = "button-cyan.png"


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    broken = []
    for name in sorted(os.listdir(UI_DIR)):
        if not name.startswith("button-") or not name.endswith(".png"):
            continue
        path = os.path.join(UI_DIR, name)
        backup = os.path.join(RAW_DIR, name)
        # 已经裁过就拿备份当输入,保证重跑幂等
        source = backup if os.path.exists(backup) else path
        if source == path:
            shutil.copy2(path, backup)
            source = backup

        result = crop_main(source)
        if not result:
            print(f"[skip] {name} 找不到不透明区域")
            continue
        cropped, count, truncated = result
        if truncated and name in REBUILD:
            broken.append(name)
            continue
        cropped.save(path)
        note = f"(原图含 {count} 块,取最大的一块)" if count > 1 else ""
        print(f"[ok] {name}  {Image.open(source).size} → {cropped.size}  {note}")

    # 截断的那些,从完好的一张改色重建
    donor_path = os.path.join(UI_DIR, DONOR)
    for name in broken:
        if not os.path.exists(donor_path):
            print(f"[fail] {name} 被截断,而供体 {DONOR} 不存在")
            continue
        donor = Image.open(donor_path).convert("RGBA")
        opts = REBUILD[name]
        rebuilt = rim_to_gray(donor) if opts.get("gray") else recolor(donor, hue=opts["hue"])
        rebuilt.save(os.path.join(UI_DIR, name))
        why = "去饱和" if opts.get("gray") else f"色相 → {opts['hue']}°"
        print(f"[rebuild] {name}  原图上半圈被截断,已从 {DONOR} 改色重建({why}) {rebuilt.size}")


main()
