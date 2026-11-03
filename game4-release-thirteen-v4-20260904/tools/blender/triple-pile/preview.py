"""
叠叠消 —— 模型验收渲染(Blender 无头运行)。

把 12 个 glb 摆成网格渲两张图,用来肉眼验收 build_models.py 的产物:
- `preview-front.png`  正视图。**应该和源图几乎一样** —— 不一样就说明 UV 投影或抠像出错了。
- `preview-game.png`   按游戏里的俯角 62° 渲。看的是侧面拉伸有多明显、轮廓有没有破洞。

用法:
    blender -b --python tools/blender/triple-pile/preview.py -- <模型目录> <输出目录>
"""

import math
import os
import sys

import bpy

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DEFAULT_MODELS = os.path.join(REPO_ROOT, "public", "triple-pile", "models")

COLS, ROWS = 4, 3
GAP = 1.5
# 游戏里的俯角,见 src/games/triple-pile/config.ts 的 CAMERA.pitchDeg
GAME_PITCH = 62.0


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # 引擎标识在 Blender 4.2 / 5.x 之间改过名,挨个试
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("W")
    scene.world.use_nodes = True
    # 深底,和游戏里的锅一个调子,方便看清边缘有没有品红镶边
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.06, 0.04, 0.03, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    key = bpy.data.lights.new("Key", type="SUN")
    key.energy = 3.2
    key_obj = bpy.data.objects.new("Key", key)
    key_obj.rotation_euler = (math.radians(35), 0, math.radians(30))
    bpy.context.collection.objects.link(key_obj)

    fill = bpy.data.lights.new("Fill", type="SUN")
    fill.energy = 1.1
    fill_obj = bpy.data.objects.new("Fill", fill)
    fill_obj.rotation_euler = (math.radians(-40), 0, math.radians(-120))
    bpy.context.collection.objects.link(fill_obj)


def load_models(models_dir):
    files = sorted(f for f in os.listdir(models_dir) if f.endswith(".glb"))
    placed = []
    for i, name in enumerate(files):
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(models_dir, name))
        new = [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]
        col, row = i % COLS, i // COLS
        x = (col - (COLS - 1) / 2) * GAP
        z = ((ROWS - 1) / 2 - row) * GAP
        for obj in new:
            # 导入回 Blender 后正面朝 -Y(见 build_models.orient_for_gltf),
            # 所以相机放在 -Y 方向、pitch=0 时看到的就是正面
            obj.location = (x, 0, z)
        placed.append((name, new))
    return placed


def render(path, pitch_deg):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = COLS * GAP + 0.6
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    # pitch=0 是正视(相机在 -Y 看向 +Y);pitch 越大越俯视
    p = math.radians(pitch_deg)
    dist = 12.0
    cam.location = (0, -dist * math.cos(p), dist * math.sin(p))
    cam.rotation_euler = (math.radians(90) - p, 0, 0)

    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.cameras.remove(cam_data)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    models_dir = argv[0] if len(argv) > 0 else DEFAULT_MODELS
    out_dir = argv[1] if len(argv) > 1 else models_dir

    setup_scene()
    placed = load_models(models_dir)
    if "--opaque" in argv:
        # 诊断开关:EEVEE 在 alpha-BLEND 材质上会出条状伪影,强制不透明可以把它排除掉。
        # 游戏里走的是 alphaTest(不混合),所以那类伪影不会出现在实际画面里。
        for mat in bpy.data.materials:
            try:
                mat.blend_method = "OPAQUE"
            except (AttributeError, TypeError):
                pass
    print(f"[triple-pile] 载入 {len(placed)} 个模型")

    render(os.path.join(out_dir, "preview-front.png"), 0.0)
    render(os.path.join(out_dir, "preview-game.png"), GAME_PITCH)
    print("[triple-pile] 预览已输出")


if __name__ == "__main__":
    main()
