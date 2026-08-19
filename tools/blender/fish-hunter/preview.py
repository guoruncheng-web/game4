"""把产出的 glb 渲成验收图。

    blender -b --python tools/blender/fish-hunter/preview.py -- <模型目录> <输出png>

渲两件事:
  1. 八条鱼的正视图 —— 应该和源图几乎一样(平面投影 UV 对齐了才会一样);
  2. 每条鱼在动画 1/4 和 1/2 周期上的姿态 —— 看摆尾是不是真的在弯,而且弯得像那种鱼。

相机用正交、正对 XY 平面,和游戏里的相机一致 —— 验收图和实际画面才是同一回事。
"""
import os
import sys
import math

import bpy

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODEL_DIR = os.path.abspath(ARGV[0] if ARGV else "public/fish-hunter/models")
OUT = os.path.abspath(ARGV[1] if len(ARGV) > 1 else "/tmp/fish-preview.png")

ORDER = ["clown", "blue", "puffer", "turtle", "ray", "shark", "dragon", "boss"]
# 动画相位。**每个相位渲一张独立的图** —— scene.frame_set 是整个场景的,
# 在同一张图里摆出三种姿态做不到:后设的帧会把先前所有骨架一起改掉,
# 三列会渲成一模一样(第一次就是这么错的)
FRAMES_AT = [0, 6, 12]
CELL_H = 1.25

for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in list(block):
        try:
            block.remove(item)
        except (RuntimeError, ReferenceError):
            pass

scene = bpy.context.scene
# EEVEE 在各版本里换过标识符(BLENDER_EEVEE → BLENDER_EEVEE_NEXT),挨个试
for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
scene.render.film_transparent = False
scene.render.resolution_x = 1300
scene.render.resolution_y = 1250
scene.render.filepath = OUT
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.09, 0.14, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.1

rows = len(ORDER)
for r, kind in enumerate(ORDER):
    path = os.path.join(MODEL_DIR, f"{kind}.glb")
    if not os.path.exists(path):
        continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    # 排版走 **Z**(行)。模型躺在 XZ 平面上,
    # 用 Y 排行的话每条鱼会一前一后地摞在相机视线方向上
    z = ((rows - 1) / 2 - r) * CELL_H
    for o in added:
        if o.parent is None:
            o.location = (o.location[0], o.location[1], o.location[2] + z)

# 相机必须沿 **-Y** 看向 +Y —— 模型建在 XZ 平面上(见 build_models.py 的坐标系说明),
# 从 +Z 俯视等于从头顶看鱼,渲出来是一条被压扁的横条。这个错第一次就踩了
bpy.ops.object.camera_add(location=(0, -14, 0), rotation=(math.radians(90), 0, 0))
cam = bpy.context.active_object
cam.data.type = "ORTHO"
cam.data.ortho_scale = 11.5
scene.camera = cam

bpy.ops.object.light_add(type="AREA", location=(3, -9, 5))
bpy.context.active_object.data.energy = 900
bpy.context.active_object.data.size = 12
bpy.ops.object.light_add(type="AREA", location=(-5, -7, -3))
bpy.context.active_object.data.energy = 400
bpy.context.active_object.data.size = 12

base, ext = os.path.splitext(OUT)
for frame in FRAMES_AT:
    scene.frame_set(frame)
    scene.render.filepath = f"{base}-f{frame:02d}{ext}"
    bpy.ops.render.render(write_still=True)
    print(f"[ok] 第 {frame} 帧 → {scene.render.filepath}")
