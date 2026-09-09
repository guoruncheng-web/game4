#!/usr/bin/env python3
"""Slice the approved GAME BOX v3 imagegen atlases into transparent runtime PNGs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


UI_SLICES = {
    "brand-logo": (0, 90, 730, 610),
    "player-hud": (710, 210, 1235, 555),
    "currency-hud": (1200, 230, 1785, 535),
    "sound-button": (1760, 250, 2048, 535),
    "adventure-portal": (0, 600, 735, 1430),
    "cube-mascot": (700, 870, 1105, 1370),
    "coming-soon-sign": (1070, 900, 1495, 1290),
    "wood-plaque": (1440, 900, 2048, 1290),
    "controller-dock": (0, 1510, 965, 2048),
    "nav-games-active": (945, 1580, 1345, 1985),
    "nav-messages": (1320, 1580, 1690, 1985),
    "nav-profile": (1660, 1580, 2048, 1985),
}

WORLD_SLICES = {
    "world-star-runner": (0, 80, 690, 1015),
    "world-fruit-slasher": (680, 80, 1370, 1015),
    "world-eight-ball": (1355, 80, 2048, 1015),
    "world-triple-pile": (0, 1010, 690, 1995),
    "world-fish-hunter": (680, 1010, 1370, 1995),
    "world-thirteen": (1355, 1010, 2048, 1995),
}

HUD_SLICES = {
    "player-hud-empty": (55, 150, 620, 505),
    "currency-hud-empty": (625, 170, 1245, 485),
    "currency-star": (1260, 165, 1515, 490),
    "currency-diamond": (1550, 175, 1815, 490),
    "unread-badge": (1880, 205, 2100, 470),
}


def chroma_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            magenta_strength = min(red, blue) - green
            if red > 205 and blue > 180 and green < 105 and magenta_strength > 100:
                alpha = 0
            elif red > 165 and blue > 130 and green < 160 and magenta_strength > 35:
                alpha = max(0, min(255, int((120 - magenta_strength) * 3)))
            else:
                alpha = 255
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    return rgba


def trim(image: Image.Image, padding: int = 8) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("slice became empty after chroma key")
    left, top, right, bottom = bbox
    return image.crop((max(0, left - padding), max(0, top - padding), min(image.width, right + padding), min(image.height, bottom + padding)))


def scaled_box(box: tuple[int, int, int, int], size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Atlas coordinates are authored in a canonical 2048 square space."""
    width, height = size
    left, top, right, bottom = box
    return (
        round(left * width / 2048),
        round(top * height / 2048),
        round(right * width / 2048),
        round(bottom * height / 2048),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ui-atlas", required=True, type=Path)
    parser.add_argument("--world-atlas", required=True, type=Path)
    parser.add_argument("--hud-atlas", type=Path)
    parser.add_argument("--road", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}
    for source, slices, group in (
        (args.ui_atlas, UI_SLICES, "shared-ui"),
        (args.world_atlas, WORLD_SLICES, "world-entrance"),
    ):
        keyed = chroma_key(Image.open(source))
        for name, box in slices.items():
            asset = trim(keyed.crop(scaled_box(box, keyed.size)))
            target = args.output / f"{name}.png"
            asset.save(target, optimize=True)
            manifest[name] = {
                "file": target.name,
                "size": [asset.width, asset.height],
                "group": group,
                "purpose": "GAME BOX v3 PWA container visual reconstruction",
                "source": source.name,
            }

    if args.hud_atlas:
        keyed = chroma_key(Image.open(args.hud_atlas))
        for name, box in HUD_SLICES.items():
            asset = trim(keyed.crop(box))
            target = args.output / f"{name}.png"
            asset.save(target, optimize=True)
            manifest[name] = {
                "file": target.name,
                "size": [asset.width, asset.height],
                "group": "dynamic-hud-frame",
                "purpose": "Empty backing for React-rendered live player and currency values",
                "source": args.hud_atlas.name,
            }

    if args.road:
        asset = trim(chroma_key(Image.open(args.road)), padding=12)
        target = args.output / "star-road.png"
        asset.save(target, optimize=True)
        manifest["star-road"] = {
            "file": target.name,
            "size": [asset.width, asset.height],
            "group": "world-navigation",
            "purpose": "Winding visual connector behind GAME BOX v3 world entrances",
            "source": args.road.name,
        }

    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
