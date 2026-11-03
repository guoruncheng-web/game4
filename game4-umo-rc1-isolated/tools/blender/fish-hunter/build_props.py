"""深海捕鱼的炮塔 → public/fish-hunter/models/cannon.glb

    blender -b --python tools/blender/fish-hunter/build_props.py -- <输出目录>

三个设计约束,改之前先读:

**一个模型,四种颜色。**
四个座位各一种色(ART.md §5 的可读性红线),但**不出四份 glb** —— 那是同一份几何
下载四遍。这里把要染色的部分单独给一个名叫 `accent` 的材质,运行时 Three 侧
克隆材质、改 color 即可。

**炮管必须是独立节点。**
瞄准是每帧都在动的,靠整体旋转会把底座也转起来(底座应该焊死在池边)。
所以层级是 `cannon → base`(不动) + `cannon → turret → barrel`(转)。
Three 侧按名字取 `turret`,只转它。

**朝向:炮管沿 Blender 的 +Z。**
glTF 导出把 Blender 的 Z-up 转成 Y-up,所以 +Z 出去就是 +Y —— 也就是屏幕上的"朝上"。
下排座位的炮口朝上正是这个姿态,上排座位在运行时整体转 180° 即可。
"""

import math
import os
import sys

import bpy

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = ARGV[0] if ARGV else "public/fish-hunter/models"

# 尺寸都以底座半径 = 1.0 为单位,运行时按座位统一缩放
BASE_R = 1.0
BASE_H = 0.34
RING_R = 1.08
YOKE_R = 0.56
YOKE_H = 0.42
BARREL_R = 0.26
BARREL_LEN = 1.45
MUZZLE_R = 0.34


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects, bpy.data.actions):
        for item in list(block):
            try:
                block.remove(item)
            except (RuntimeError, ReferenceError):
                pass


def material(name, color, metallic=0.75, roughness=0.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def cylinder(name, radius, depth, z, mat, radius_top=None, verts=24):
    """一节圆柱。radius_top 不同就是圆台 —— 炮管靠它做出收口。"""
    if radius_top is None or abs(radius_top - radius) < 1e-6:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                            location=(0, 0, z))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=radius_top,
                                        depth=depth, location=(0, 0, z))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    # 侧面平滑、上下底面保持硬边,否则圆柱的边缘会糊成一团
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
    return obj


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def main():
    out_dir = os.path.abspath(OUT_DIR)
    os.makedirs(out_dir, exist_ok=True)
    clear_scene()

    steel = material("body", (0.10, 0.20, 0.27), metallic=0.8, roughness=0.32)
    dark = material("dark", (0.04, 0.09, 0.13), metallic=0.6, roughness=0.5)
    # 这个材质的颜色**在运行时按座位覆盖**,这里给白色只是中性底
    accent = material("accent", (1.0, 1.0, 1.0), metallic=0.35, roughness=0.28)

    # --- 底座:一个厚圆盘 + 一圈发光的座位色环 + 内圈暗色
    base_disc = cylinder("base-disc", BASE_R, BASE_H, BASE_H / 2, steel)
    base_ring = cylinder("base-ring", RING_R, 0.10, BASE_H - 0.02, accent)
    base_inner = cylinder("base-inner", BASE_R * 0.62, BASE_H + 0.06, BASE_H / 2 + 0.05, dark)
    base = join([base_disc, base_ring, base_inner], "base")

    # --- 转塔:轭座 + 炮管 + 炮口环。整体是一个可旋转的节点
    yoke = cylinder("yoke", YOKE_R, YOKE_H, BASE_H + YOKE_H / 2, steel)
    barrel = cylinder("barrel-tube", BARREL_R, BARREL_LEN,
                      BASE_H + YOKE_H + BARREL_LEN / 2 - 0.1, steel,
                      radius_top=BARREL_R * 0.82)
    # 炮管上的座位色套环:玩家在混战里认自己那门炮,靠的就是这一圈
    collar = cylinder("barrel-collar", BARREL_R * 1.25, 0.16,
                      BASE_H + YOKE_H + BARREL_LEN * 0.30, accent)
    muzzle = cylinder("muzzle", MUZZLE_R, 0.18,
                      BASE_H + YOKE_H + BARREL_LEN - 0.16, dark,
                      radius_top=MUZZLE_R * 0.9)
    turret_mesh = join([yoke, barrel, collar, muzzle], "turret-mesh")

    # --- 层级。turret 是个空物体,支点放在轭座中心,炮管绕它转
    pivot_z = BASE_H + YOKE_H * 0.5
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, pivot_z))
    turret = bpy.context.active_object
    turret.name = "turret"

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = "cannon"

    # 先设父级再修正变换,免得子物体被父级的位移拖走
    turret_mesh.parent = turret
    turret_mesh.matrix_parent_inverse = turret.matrix_world.inverted()
    turret.parent = root
    base.parent = root

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, "cannon.glb"),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
    )
    size = os.path.getsize(os.path.join(out_dir, "cannon.glb")) / 1024
    print(f"[ok] cannon.glb  {size:.0f}KB  节点 cannon/base + cannon/turret(可转)")


main()
