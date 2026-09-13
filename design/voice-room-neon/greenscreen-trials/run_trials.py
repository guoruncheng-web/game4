"""方案 B 试样：让 Qwen-Image-Edit 参照概念稿把单个组件重画在纯绿幕上。

用 subprocess 传参数列表调用 comfy_qwen_edit.py，绕开 shell 对中文和 '#' 的解析。
用法: python3 run_trials.py <trial_key>   (trial_key 见 TRIALS)
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]          # cocos-game-studio
DESIGN = Path(__file__).resolve().parents[1]        # voice-room-neon
SCRIPT = ROOT / ".tmp" / "comfy" / "comfy_qwen_edit.py"
OUT = Path(__file__).resolve().parent

GREEN = (
    "背景必须替换为完全均匀的纯绿色 #00FF00 色键背景，"
    "不要任何星点、云雾、渐变、噪点、阴影或倒影。"
    "组件水平垂直居中，四周留出充足空白，外发光和描边必须完整，不能被画面边缘裁切。"
    "这是游戏 UI 素材切图，高清，边缘锐利干净，只画这一个组件，画面里不要出现其他任何元素。"
)

TRIALS = {
    "button-gold": {
        "ref": DESIGN / "cutouts" / "popup-confirm" / "button-primary-outline.png",
        "size": (1024, 512),
        "seeds": "95101,95102",
        "prompt": (
            "把 image1 中的这个金色胶囊按钮单独重新绘制出来。"
            "严格保持与 image1 完全一致的胶囊圆角形状、宽高比例、金色渐变底面、"
            "双层金色描边、内侧高光和四周暖金色外发光。"
            "去掉按钮上的所有文字，按钮内部保持干净的金色渐变面，不要任何字符。" + GREEN
        ),
    },
    "seat-occupied": {
        "ref": DESIGN / "cutouts" / "main-room" / "seat-frame-occupied-plain.png",
        "size": (1024, 1024),
        "seeds": "95201,95202",
        "prompt": (
            "把 image1 中的这个圆形麦位头像框单独重新绘制出来。"
            "严格保持与 image1 完全一致的金色花丝雕花圆环、藤蔓与丝带缠绕细节、"
            "淡紫色丝绸质感、金属光泽和厚度。"
            "圆环中心必须是空的，不要画任何动物头像、人脸或图案，中心留空供运行时填入头像。" + GREEN
        ),
    },
    "seat-empty": {
        "ref": DESIGN / "cutouts" / "main-room" / "seat-empty-frame.png",
        "size": (1024, 1024),
        "seeds": "95301,95302",
        "prompt": (
            "把 image1 中的这个空麦位圆形按钮单独重新绘制出来。"
            "严格保持与 image1 完全一致的深紫色半透明圆形底、紫色发光圆环描边、"
            "以及圆心那个柔光发亮的白紫色麦克风图标。"
            "去掉下方的“点击上麦”文字胶囊和所有文字，只保留圆形底和麦克风图标。" + GREEN
        ),
    },
}


def main():
    key = sys.argv[1]
    t = TRIALS[key]
    w, h = t["size"]
    cmd = [
        sys.executable, str(SCRIPT),
        str(OUT), f"trial-{key}", t["prompt"],
        str(w), str(h), t["seeds"], str(t["ref"]),
    ]
    print("ref:", t["ref"].name, "size:", w, "x", h, flush=True)
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
