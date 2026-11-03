"""Ludo 棋子与骰子 GLB 生成器。

在仓库根目录运行：
    blender -b --python tools/blender/ludo/build_models.py

输出：public/ludo/models/pawn.glb、dice.glb。
棋子主体材质固定命名为 ``accent``，运行时按红 / 黄 / 蓝 / 绿换色。
"""

import os

import bpy
import mathutils


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "public", "ludo", "models")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metallic=0.0, roughness=0.24):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def smooth(obj, mat):
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    bevel = obj.modifiers.new("圆润边缘", "BEVEL")
    bevel.width = 0.045
    bevel.segments = 3
    return obj


def uv_sphere(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return smooth(obj, mat)


def cylinder(name, location, radius, depth, mat, scale=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return smooth(obj, mat)


def export(name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    low = mathutils.Vector((float("inf"),) * 3)
    high = mathutils.Vector((float("-inf"),) * 3)
    triangles = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        triangles += sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
        for corner in obj.bound_box:
            point = obj.matrix_world @ mathutils.Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    dims = tuple(round(value, 3) for value in high - low)
    print(f"EXPORTED {path} tris={triangles} dims={dims}")


def build_pawn():
    reset()
    accent = material("accent", (0.92, 0.04, 0.03), metallic=0.08, roughness=0.18)
    cylinder("底座", (0, 0, 0.12), 0.46, 0.24, accent)
    cylinder("底座上沿", (0, 0, 0.27), 0.36, 0.16, accent)
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.31, radius2=0.14, depth=0.68, location=(0, 0, 0.66))
    body = bpy.context.object
    body.name = "棋子身体"
    smooth(body, accent)
    uv_sphere("棋子头", (0, 0, 1.12), (0.26, 0.26, 0.26), accent)
    export("pawn.glb")


def build_dice():
    reset()
    ivory = material("dice-body", (0.94, 0.94, 0.9), metallic=0.0, roughness=0.22)
    pip = material("dice-pip", (0.045, 0.035, 0.035), metallic=0.0, roughness=0.3)
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    cube = bpy.context.object
    cube.name = "骰子主体"
    cube.data.materials.append(ivory)
    bevel = cube.modifiers.new("骰子圆角", "BEVEL")
    bevel.width = 0.12
    bevel.segments = 5

    # 四个面使用 1 / 2 / 3 / 6 点；开局动画最终将六点面转向镜头。
    uv_sphere("顶面一点", (0, 0, 0.505), (0.065, 0.065, 0.025), pip)
    for index, (x, z) in enumerate(((-0.2, 0.2), (0.2, -0.2))):
        uv_sphere(f"前面二点{index}", (x, -0.505, z), (0.065, 0.025, 0.065), pip)
    for index, (y, z) in enumerate(((-0.21, 0.21), (0, 0), (0.21, -0.21))):
        uv_sphere(f"右面三点{index}", (0.505, y, z), (0.025, 0.065, 0.065), pip)
    for index, (y, z) in enumerate(((-0.2, -0.2), (-0.2, 0.2), (0.2, -0.2), (0.2, 0.2))):
        uv_sphere(f"左面四点{index}", (-0.505, y, z), (0.025, 0.065, 0.065), pip)
    for index, (x, z) in enumerate(((-0.2, -0.2), (-0.2, 0.2), (0, 0), (0.2, -0.2), (0.2, 0.2))):
        uv_sphere(f"后面五点{index}", (x, 0.505, z), (0.065, 0.025, 0.065), pip)
    for index, (x, y) in enumerate((
        (-0.2, -0.22), (-0.2, 0), (-0.2, 0.22),
        (0.2, -0.22), (0.2, 0), (0.2, 0.22),
    )):
        uv_sphere(f"底面六点{index}", (x, y, -0.505), (0.065, 0.065, 0.025), pip)
    export("dice.glb")


if __name__ == "__main__":
    build_pawn()
    build_dice()
