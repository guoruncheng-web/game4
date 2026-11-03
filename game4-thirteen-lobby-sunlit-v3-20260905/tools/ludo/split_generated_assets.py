from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]


def remove_magenta(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            distance = max(abs(red - 255), green, abs(blue - 255))
            if distance < 18:
                alpha = 0
            elif distance < 80:
                alpha = round(alpha * (distance - 18) / 62)
            pixels[x, y] = (red, green, blue, alpha)
    return rgba


def split_grid(source: Path, destination: Path, names: list[str], columns: int, rows: int) -> None:
    image = remove_magenta(Image.open(source))
    destination.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(names):
        column, row = index % columns, index // columns
        box = (
            round(column * image.width / columns),
            round(row * image.height / rows),
            round((column + 1) * image.width / columns),
            round((row + 1) * image.height / rows),
        )
        image.crop(box).save(destination / f"{name}.png")


split_grid(
    ROOT / "src/games/ludo/assets/source/icons-source.png",
    ROOT / "public/ludo/ui/icons",
    ["create", "join", "copy", "close", "clock", "players", "crown", "ready", "settings", "add-seat", "robot", "send"],
    4,
    3,
)
split_grid(
    ROOT / "src/games/ludo/assets/source/avatars-source.png",
    ROOT / "public/ludo/avatars",
    ["player-01", "player-02", "player-03", "player-04", "player-05", "player-06", "bot"],
    4,
    2,
)

ui = Image.open(ROOT / "src/games/ludo/assets/source/ui-kit-source.png").convert("RGBA")
ui_dir = ROOT / "public/ludo/ui"
ui_dir.mkdir(parents=True, exist_ok=True)
ui.crop((0, 0, round(ui.width * 0.64), ui.height)).save(ui_dir / "dialog-panel.png")
button_names = ["button-purple", "button-cyan", "button-yellow", "button-green", "button-disabled"]
left = round(ui.width * 0.64)
for index, name in enumerate(button_names):
    top = round(index * ui.height / 5)
    bottom = round((index + 1) * ui.height / 5)
    ui.crop((left, top, ui.width, bottom)).save(ui_dir / f"{name}.png")
