"""
Step 2 of the restoration pipeline: crop each reusable component out of the
approved main-room concept (main-room-starry-v3_84001.png) by its element
boundary. Output tiles still carry the painted night-sky background behind
them -- they are reference material for step 3 (Qwen-Image-Edit: strip text,
rebuild the backing plate, 2x upscale) and step 4 (chroma-key transparent
extraction), not production-ready transparent assets yet.

Boxes were read off a 50px coordinate grid overlaid on the source image
(see ../_probe/84001-grid-top.png / -bot.png) and are in source-pixel space
(source is 768x1664).
"""
import json
import os
from PIL import Image

SRC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "main-room-candidates")
OUT_DIR = os.path.dirname(__file__)

MAIN = os.path.join(SRC_DIR, "main-room-starry-v3_84001.png")

# name -> (source_file, (left, top, right, bottom), note)
BOXES = {
    "topbar-room-icon-bubble": (MAIN, (18, 108, 118, 192), "顶栏左侧圆形房间图标气泡"),
    "topbar-room-name-plate": (MAIN, (110, 112, 320, 188), "顶栏房名牌胶囊(不含图标)"),
    "topbar-online-capsule": (MAIN, (445, 116, 652, 184), "在线人数胶囊(含2个mini头像位)"),
    "topbar-settings-button": (MAIN, (652, 104, 756, 198), "设置齿轮圆按钮"),
    "topbar-pending-capsule": (MAIN, (572, 206, 756, 274), "待审批胶囊"),

    "seat-frame-occupied-speaking": (MAIN, (0, 316, 216, 512), "有人麦位框(说话中,含金色声波光晕)"),
    "seat-frame-occupied-plain": (MAIN, (208, 328, 384, 502), "有人麦位框(未说话,基础态)"),
    "seat-frame-occupied-with-moon": (MAIN, (392, 296, 568, 502), "有人麦位框(顶部带月牙挂饰)"),
    "seat-frame-occupied-with-badge": (MAIN, (574, 328, 754, 502), "有人麦位框(右上角圆形徽章位)"),
    "seat-badge-corner": (MAIN, (694, 328, 754, 386), "麦位右上角圆形徽章(单独)"),
    "moon-crescent-accent": (MAIN, (452, 296, 512, 330), "麦位顶部月牙挂饰(单独)"),

    "seat-empty-frame": (MAIN, (392, 586, 568, 756), "空麦位(暗环+发光麦克风+点击上麦)"),
    "seat-empty-frame-2": (MAIN, (574, 586, 754, 756), "空麦位第二个(用于核对样式一致性)"),

    "name-lv-tag-row1": (MAIN, (30, 504, 186, 550), "麦位名牌/Lv 标签胶囊(行1样例)"),
    "name-lv-tag-row2": (MAIN, (390, 754, 570, 800), "麦位名牌/Lv 标签胶囊(行2样例)"),

    "chat-avatar-emoji": (MAIN, (36, 858, 104, 924), "聊天头像圆(emoji 风格样例)"),
    "chat-avatar-photo": (MAIN, (36, 1058, 104, 1124), "聊天头像圆(写实照片风格样例)"),
    "chat-bubble-plain": (MAIN, (112, 858, 584, 924), "聊天气泡(基础态,含展开箭头)"),
    "chat-badge-pill": (MAIN, (34, 1016, 108, 1046), "聊天区身份小标签胶囊(如房主/管理)"),

    "bottombar-mic-button": (MAIN, (18, 1546, 104, 1630), "底栏麦克风圆按钮"),
    "bottombar-input-field": (MAIN, (110, 1550, 546, 1628), "底栏输入框"),
    "bottombar-icon-button-1": (MAIN, (552, 1550, 632, 1628), "底栏功能圆按钮(游戏)"),
    "bottombar-icon-button-2": (MAIN, (644, 1550, 752, 1628), "底栏功能圆按钮(礼物/更多)"),

    "stage-light-glow-wide": (MAIN, (0, 760, 768, 838), "麦位区下方舞台金色光晕(宽幅装饰)"),
}

manifest = []
for name, (src, box, note) in BOXES.items():
    im = Image.open(src).convert("RGB")
    tile = im.crop(box)
    out_path = os.path.join(OUT_DIR, f"{name}.png")
    tile.save(out_path)
    manifest.append({
        "name": name,
        "source": os.path.relpath(src, OUT_DIR),
        "box_px": list(box),
        "size_px": list(tile.size),
        "note": note,
    })

with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"cropped {len(manifest)} tiles into {OUT_DIR}")
