"""把抠好的素材拼成验收总览图：每个槽位一格，深紫底（真实使用场景）+ 棋盘底（查边缘/溢色）。

用法: python3 make_asset_sheet.py <out.png> [seed_suffix]
默认取每个槽位的第一个 seed。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slots import SLOTS  # noqa: E402

ASSETS = Path(__file__).resolve().parents[1] / "greenscreen-assets"
CELL = 190
LABEL = 26
COLS = 4


def checker(w, h, size=14):
    a = np.indices((h, w)).sum(axis=0) // size % 2
    return np.dstack([np.where(a, 215, 165)] * 3).astype(np.uint8)


def pick(fname_stem: str):
    hits = sorted(ASSETS.glob(fname_stem + "_*.png"))
    return hits[0] if hits else None


def main():
    out_path = Path(sys.argv[1])
    entries = []
    for key in SLOTS:
        p = pick(key.replace(".", "-"))
        if p:
            entries.append((key, p))

    rows = (len(entries) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CELL * 2, rows * (CELL + LABEL)), (26, 26, 32))
    draw = ImageDraw.Draw(sheet)

    for i, (key, path) in enumerate(entries):
        r, c = divmod(i, COLS)
        im = Image.open(path).convert("RGBA")
        im.thumbnail((CELL - 12, CELL - 12))
        w, h = im.size

        dark = Image.new("RGBA", (w, h), (42, 30, 82, 255)); dark.alpha_composite(im)
        chk = Image.fromarray(checker(w, h)).convert("RGBA"); chk.alpha_composite(im)

        x0 = c * CELL * 2
        y0 = r * (CELL + LABEL)
        sheet.paste(dark.convert("RGB"), (x0 + (CELL - w) // 2, y0 + (CELL - h) // 2))
        sheet.paste(chk.convert("RGB"), (x0 + CELL + (CELL - w) // 2, y0 + (CELL - h) // 2))
        draw.text((x0 + 4, y0 + CELL + 4), key, fill=(255, 220, 90))

    sheet.save(out_path)
    print("saved", out_path, sheet.size, "slots:", len(entries))


if __name__ == "__main__":
    main()
