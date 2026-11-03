"""在 Blender 中程序化创建并渲染《霓虹突击》玩家战机样片。"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[1] / "public/neon-strike/assets/player-fighter-3d-v2.png"


def material(name, color, metallic=0.0, roughness=0.45, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


NAVY = material("深空蓝装甲", (0.012, 0.032, 0.07), 0.92, 0.18)
SILVER = material("钛灰装甲", (0.17, 0.23, 0.31), 0.96, 0.14)
GUNMETAL = material("枪灰装甲", (0.045, 0.065, 0.09), 0.94, 0.2)
DARK = material("深色机械", (0.012, 0.018, 0.026), 0.78, 0.25)
GLASS = material("驾驶舱玻璃", (0.018, 0.16, 0.24), 0.62, 0.08)
CYAN = material("青色能量", (0.005, 0.15, 0.25), 0.25, 0.18, (0.02, 0.7, 1.0), 7.5)
AMBER = material("琥珀警示灯", (0.25, 0.06, 0.005), 0.15, 0.25, (1.0, 0.22, 0.02), 5.0)


def smooth_bevel(obj, width=0.08, segments=3):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("倒角", "BEVEL")
    bevel.width = width
    bevel.segments = segments


def cube(name, location, scale, mat, bevel=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth_bevel(obj, bevel)
    return obj


def sphere(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth_bevel(obj, 0.035, 2)
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(math.pi / 2, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    smooth_bevel(obj, 0.045, 2)
    return obj


def prism(name, points, thickness, mat, z=0):
    count = len(points)
    verts = [(x, y, z - thickness / 2) for x, y in points] + [(x, y, z + thickness / 2) for x, y in points]
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + "网格")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    smooth_bevel(obj, 0.09, 3)
    return obj


def aim_at(obj, target=(0, 0, 0)):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_ship():
    # 尖锐的中央枪骑机身，避免圆润玩具感。
    prism("中央主机身", [(-0.5, -1.75), (-0.62, 0.75), (-0.3, 2.45), (0, 3.65),
                       (0.3, 2.45), (0.62, 0.75), (0.5, -1.75)], 0.55, NAVY, 0.42)
    prism("机鼻钛甲", [(-0.26, 1.35), (0, 3.48), (0.26, 1.35), (0.18, 0.35), (-0.18, 0.35)], 0.12, SILVER, 0.75)
    prism("左前掠翼", [(-0.35, 1.1), (-3.35, -0.55), (-2.7, -1.15), (-0.82, -0.42)], 0.22, NAVY, 0.18)
    prism("右前掠翼", [(0.35, 1.1), (3.35, -0.55), (2.7, -1.15), (0.82, -0.42)], 0.22, NAVY, 0.18)
    prism("左翼刃", [(-0.72, 0.62), (-3.15, -0.6), (-2.72, -0.78), (-0.95, -0.12)], 0.07, SILVER, 0.39)
    prism("右翼刃", [(0.72, 0.62), (3.15, -0.6), (2.72, -0.78), (0.95, -0.12)], 0.07, SILVER, 0.39)
    prism("左分裂尾翼", [(-0.4, -1.2), (-1.78, -2.85), (-1.02, -2.62), (-0.2, -1.55)], 0.2, GUNMETAL, 0.22)
    prism("右分裂尾翼", [(0.4, -1.2), (1.78, -2.85), (1.02, -2.62), (0.2, -1.55)], 0.2, GUNMETAL, 0.22)

    sphere("装甲座舱", (0, 0.68, 0.88), (0.3, 0.9, 0.3), GLASS)
    prism("座舱护甲", [(-0.34, 0.15), (-0.32, 1.28), (0, 1.7), (0.32, 1.28), (0.34, 0.15)], 0.08, SILVER, 0.93)
    cube("背部能量脊", (0, -0.68, 0.82), (0.13, 0.78, 0.12), CYAN, 0.045)
    for side in (-1, 1):
        cylinder(f"{side}号矢量引擎", (side * 0.58, -1.65, 0.38), 0.4, 1.65, DARK)
        cylinder(f"{side}号引擎装甲环", (side * 0.58, -2.37, 0.38), 0.46, 0.22, SILVER)
        cylinder(f"{side}号蓝焰核心", (side * 0.58, -2.52, 0.38), 0.32, 0.13, CYAN)
        cube(f"{side}号重型轨道炮", (side * 1.78, -0.05, 0.38), (0.14, 0.82, 0.14), GUNMETAL, 0.035)
        cube(f"{side}号轨道炮口", (side * 1.78, 0.8, 0.38), (0.1, 0.15, 0.1), CYAN, 0.025)
        for index, y in enumerate((0.35, -0.05, -0.45)):
            cube(f"{side}号翼部能量槽{index}", (side * (1.18 + index * 0.42), y, 0.42), (0.24, 0.035, 0.03), CYAN, 0.015)
    cube("机鼻能量刃", (0, 2.18, 0.82), (0.055, 0.55, 0.035), CYAN, 0.015)
    cube("尾部警示灯", (0, -1.7, 0.84), (0.07, 0.22, 0.04), AMBER, 0.02)


def setup_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass
    build_ship()

    bpy.ops.object.camera_add(location=(0, -10.8, 14.8))
    camera = bpy.context.object
    camera.name = "固定俯视相机"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 8.7
    aim_at(camera, (0, 0, 0.2))
    bpy.context.scene.camera = camera

    for name, location, energy, color, size in (
        ("左上主光", (-5.5, 4.5, 9), 1150, (0.55, 0.78, 1.0), 5.0),
        ("右侧轮廓光", (5.5, -1.5, 7), 980, (0.12, 0.62, 1.0), 4.0),
        ("机鼻暖色补光", (0, 6, 5), 620, (1.0, 0.25, 0.08), 3.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        aim_at(light, (0, 0, 0))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 1152
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.filepath = str(OUTPUT)
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_percentage = 100
    scene.world.color = (0.002, 0.003, 0.008)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT.with_suffix(".blend")))
    bpy.ops.render.render(write_still=True)


setup_scene()
