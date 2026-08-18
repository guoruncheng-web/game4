"""
霓虹突击 —— 敌机 / Boss 的 3D 模型生成脚本(Blender 无头运行)。

玩家战机有手工建的 .blend 源(player-fighter-3d-v2.blend),敌机和 Boss 原来只有 PNG,
这个脚本按同一套形状语言把它们补成低模,并直接导出 glb 给 Three.js 用。

用法(在装了 Blender 的机器上):
    blender -b --python tools/blender/neon-strike/build_models.py -- public/neon-strike/models

约定:
- 机头朝 +Y。glTF 导出走 Y-up 转换,+Y 会变成 Three.js 的 -Z,正好是"朝屏幕里飞"的前方,
  所以模型进引擎后不需要额外旋转,敌机只要绕 Y 转 180° 就是迎面而来。
- 能量部件走自发光材质(Emission),Three.js 侧配合 Bloom 直接出霓虹辉光。
- 面数刻意压在几千以内:同屏可能有十几架敌机,低模 + 硬表面着色比高模更符合霓虹风格。
"""

import math
import os
import sys

import bpy


# ---------------------------------------------------------------- 基础工具

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, color, *, metal=0.85, rough=0.38, emit=None, emit_strength=4.0, alpha=1.0):
    """统一的材质构造。emit 传颜色即为自发光件。"""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        # Blender 各版本控制透明的属性名不一样,能设上哪个算哪个
        try:
            mat.blend_method = 'BLEND'
        except (AttributeError, TypeError):
            pass
    return mat


def finish(obj, name, material, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), shade_smooth=False):
    obj.name = name
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = scale
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if shade_smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def box(name, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    return finish(bpy.context.object, name, material, loc, rot, scale)


def wedge(name, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
    """四棱锥。默认尖端朝 +Z,配合 rot 转成朝 +Y 的机头。"""
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.5, radius2=0.0, depth=1)
    return finish(bpy.context.object, name, material, loc, rot, scale)


def taper(name, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), tip=0.28):
    """带收窄的棱台,用来做前粗后细(或反过来)的机身段。"""
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.5, radius2=0.5 * tip, depth=1)
    return finish(bpy.context.object, name, material, loc, rot, scale)


def tube(name, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=0.5, depth=1)
    return finish(bpy.context.object, name, material, loc, rot, scale, shade_smooth=True)


def ball(name, material, loc=(0, 0, 0), scale=(1, 1, 1), subdiv=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=0.5)
    return finish(bpy.context.object, name, material, loc, (0, 0, 0), scale, shade_smooth=True)


def ring(name, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), major=16, minor=6):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major, minor_segments=minor, major_radius=0.5, minor_radius=0.09,
    )
    return finish(bpy.context.object, name, material, loc, rot, scale, shade_smooth=True)


def mirror_x(obj, name):
    """沿 X 轴镜像一份,做左右对称件。"""
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.location = (-obj.location[0], obj.location[1], obj.location[2])
    copy.rotation_euler = (obj.rotation_euler[0], -obj.rotation_euler[1], -obj.rotation_euler[2])
    copy.scale = obj.scale
    bpy.context.collection.objects.link(copy)
    return copy


def export(path):
    for obj in bpy.data.objects:
        obj.select_set(obj.type == 'MESH')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT',
    )
    tris = sum(
        sum(len(p.vertices) - 2 for p in o.data.polygons)
        for o in bpy.data.objects if o.type == 'MESH'
    )
    print(f"EXPORTED {path} tris={tris} size={os.path.getsize(path)}")


# ---------------------------------------------------------------- 敌机

def build_enemy_drone():
    """小型突击无人机:楔形机身 + 后掠翼 + 猩红能量核心。整机约 2.6 长、2.4 宽。"""
    reset_scene()
    armor = make_material("敌机暗红装甲", (0.115, 0.028, 0.042), metal=0.82, rough=0.34)
    plate = make_material("敌机深色机械", (0.045, 0.045, 0.058), metal=0.9, rough=0.5)
    core = make_material("猩红能量", (0.9, 0.12, 0.1), metal=0.0, rough=0.2,
                         emit=(1.0, 0.22, 0.12), emit_strength=7.0)
    warn = make_material("橙色警示灯", (1.0, 0.55, 0.16), metal=0.0, rough=0.25,
                         emit=(1.0, 0.58, 0.18), emit_strength=5.0)
    glass = make_material("敌机镜面舱", (0.03, 0.05, 0.08), metal=0.2, rough=0.06, alpha=0.75)

    # 机身:前段收窄成机头,后段是方正的动力舱
    wedge("机头", armor, loc=(0, 0.95, 0), scale=(1.05, 0.42, 1.5), rot=(math.radians(90), 0, 0))
    taper("主机身", armor, loc=(0, -0.15, 0), scale=(1.1, 0.44, 1.5),
          rot=(math.radians(-90), 0, 0), tip=0.55)
    box("背脊装甲", plate, loc=(0, -0.1, 0.2), scale=(0.34, 1.5, 0.16))
    ball("感应舱", glass, loc=(0, 0.55, 0.12), scale=(0.36, 0.6, 0.22))

    # 后掠翼:主翼 + 下垂的翼刃,让轮廓在俯视和侧视里都立得住
    w = box("右主翼", armor, loc=(0.78, -0.2, -0.02), scale=(1.5, 1.0, 0.09),
            rot=(0, math.radians(-9), math.radians(-32)))
    mirror_x(w, "左主翼")
    t = box("右翼刃", plate, loc=(1.18, -0.62, -0.16), scale=(0.7, 0.42, 0.3),
            rot=(math.radians(24), 0, math.radians(-26)))
    mirror_x(t, "左翼刃")
    s = box("右翼能量条", core, loc=(0.72, -0.14, 0.05), scale=(0.85, 0.1, 0.045),
            rot=(0, 0, math.radians(-32)))
    mirror_x(s, "左翼能量条")

    # 能量核心 + 尾部推进
    ball("动力核心", core, loc=(0, -0.52, 0.02), scale=(0.5, 0.5, 0.42))
    ring("核心环", plate, loc=(0, -0.52, 0.02), scale=(0.86, 0.86, 0.86), rot=(math.radians(90), 0, 0))
    e = tube("右引擎", plate, loc=(0.33, -1.02, -0.02), scale=(0.34, 0.34, 0.6),
             rot=(math.radians(90), 0, 0))
    mirror_x(e, "左引擎")
    f = tube("右尾焰", core, loc=(0.33, -1.3, -0.02), scale=(0.26, 0.26, 0.06),
             rot=(math.radians(90), 0, 0))
    mirror_x(f, "左尾焰")
    box("机头警示灯", warn, loc=(0, 1.42, 0.02), scale=(0.13, 0.3, 0.07))


# ---------------------------------------------------------------- Boss

def build_boss_carrier():
    """核心战舰:宽体舰身 + 两侧炮塔吊舱 + 中央裸露核心。约 9 宽、7 长。"""
    reset_scene()
    hull = make_material("Boss 暗紫装甲", (0.075, 0.055, 0.11), metal=0.86, rough=0.36)
    plate = make_material("Boss 深色机械", (0.035, 0.035, 0.05), metal=0.92, rough=0.52)
    trim = make_material("Boss 钛灰装甲", (0.19, 0.2, 0.24), metal=0.9, rough=0.3)
    core = make_material("Boss 核心能量", (0.95, 0.2, 0.45), metal=0.0, rough=0.18,
                         emit=(1.0, 0.24, 0.5), emit_strength=8.0)
    glow = make_material("Boss 舷灯", (0.35, 0.85, 1.0), metal=0.0, rough=0.2,
                         emit=(0.4, 0.9, 1.0), emit_strength=5.0)

    # 舰体:中央梯形主体 + 前缘撞角
    taper("主舰体", hull, loc=(0, -0.3, 0), scale=(4.4, 1.0, 4.6),
          rot=(math.radians(-90), 0, 0), tip=0.62)
    box("上层甲板", hull, loc=(0, -0.5, 0.62), scale=(3.0, 3.2, 0.5))
    box("舰桥", trim, loc=(0, -1.5, 1.05), scale=(1.5, 1.5, 0.55))
    wedge("前缘撞角", trim, loc=(0, 2.55, 0), scale=(2.2, 0.7, 1.9), rot=(math.radians(90), 0, 0))

    # 中央核心:裸露的能量球嵌在装甲缺口里,是玩家的视觉打击点
    ball("核心球", core, loc=(0, 0.55, 0.25), scale=(1.5, 1.5, 1.3))
    ring("核心护环", plate, loc=(0, 0.55, 0.25), scale=(2.5, 2.5, 2.5), rot=(math.radians(90), 0, 0))
    ring("核心斜环", trim, loc=(0, 0.55, 0.25), scale=(2.2, 2.2, 2.2),
         rot=(math.radians(90), math.radians(40), 0))

    # 两侧吊舱与炮塔
    p = taper("右吊舱", hull, loc=(3.3, 0.1, -0.05), scale=(1.5, 1.3, 3.4),
              rot=(math.radians(-90), 0, 0), tip=0.5)
    mirror_x(p, "左吊舱")
    g = tube("右主炮", plate, loc=(3.3, 2.1, -0.05), scale=(0.5, 0.5, 2.2),
             rot=(math.radians(90), 0, 0))
    mirror_x(g, "左主炮")
    m = tube("右炮口", core, loc=(3.3, 3.2, -0.05), scale=(0.42, 0.42, 0.18),
             rot=(math.radians(90), 0, 0))
    mirror_x(m, "左炮口")
    v = box("右吊舱能量槽", core, loc=(3.3, -0.5, 0.62), scale=(0.34, 2.0, 0.12))
    mirror_x(v, "左吊舱能量槽")

    # 翼板:把轮廓横向拉开,远处也能一眼认出是 Boss
    w = box("右翼板", hull, loc=(2.1, -1.6, 0.05), scale=(2.6, 1.8, 0.24),
            rot=(0, math.radians(-7), math.radians(-14)))
    mirror_x(w, "左翼板")
    l = box("右舷灯", glow, loc=(2.3, -2.3, 0.2), scale=(1.8, 0.16, 0.09),
            rot=(0, 0, math.radians(-14)))
    mirror_x(l, "左舷灯")

    # 尾部推进阵列
    for i, x in enumerate((-1.7, -0.6, 0.6, 1.7)):
        tube(f"{i}号引擎", plate, loc=(x, -2.95, 0.1), scale=(0.8, 0.8, 1.0),
             rot=(math.radians(90), 0, 0))
        tube(f"{i}号尾焰", core, loc=(x, -3.45, 0.1), scale=(0.62, 0.62, 0.1),
             rot=(math.radians(90), 0, 0))


# ---------------------------------------------------------------- 场景结构物(两侧掠过的巨型物件)

def build_pylon_truss():
    """轨道桁架塔:四根立柱 + 横环 + 交叉斜撑 + 顶部信号灯。约 3.4 见方、26 高。

    做成镂空桁架而不是实心柱,是因为它在玩家余光里以每秒几十单位的速度掠过 ——
    实心体只会读成"一块黑",镂空结构在背景星空的衬托下才会闪出高速掠过的频闪感。
    """
    reset_scene()
    steel = make_material("桁架钢材", (0.16, 0.17, 0.21), metal=0.92, rough=0.34)
    dark = make_material("桁架暗件", (0.04, 0.045, 0.06), metal=0.9, rough=0.5)
    lamp = make_material("桁架航行灯", (0.3, 0.85, 1.0), metal=0.0, rough=0.2,
                         emit=(0.35, 0.9, 1.0), emit_strength=6.0)

    half, height = 1.5, 26.0
    # 四根立柱
    for i, (x, y) in enumerate(((half, half), (half, -half), (-half, half), (-half, -half))):
        box(f"立柱{i}", steel, loc=(x, y, 0), scale=(0.34, 0.34, height))

    # 每隔一段一道横环 + 一对交叉斜撑;斜撑只在两个相对面上做,面数省一半,观感不差
    levels = 7
    for i in range(levels):
        z = -height / 2 + (i + 0.5) * (height / levels)
        box(f"横梁{i}A", dark, loc=(0, half, z), scale=(half * 2, 0.2, 0.2))
        box(f"横梁{i}B", dark, loc=(0, -half, z), scale=(half * 2, 0.2, 0.2))
        box(f"横梁{i}C", dark, loc=(half, 0, z), scale=(0.2, half * 2, 0.2))
        box(f"横梁{i}D", dark, loc=(-half, 0, z), scale=(0.2, half * 2, 0.2))
        lean = math.atan2(height / levels, half * 2)
        box(f"斜撑{i}A", dark, loc=(0, half, z + height / levels / 2),
            scale=(0.14, 0.14, math.hypot(half * 2, height / levels)),
            rot=(0, math.pi / 2 - lean, 0))
        box(f"斜撑{i}B", dark, loc=(0, -half, z + height / levels / 2),
            scale=(0.14, 0.14, math.hypot(half * 2, height / levels)),
            rot=(0, lean - math.pi / 2, 0))

    # 竖直光带:高速掠过时它会拉成一条亮线,是速度感的主要来源
    box("光带A", lamp, loc=(half + 0.2, 0, 0), scale=(0.1, 0.16, height * 0.86))
    box("光带B", lamp, loc=(-half - 0.2, 0, 0), scale=(0.1, 0.16, height * 0.86))

    # 顶部天线阵与端头
    box("顶盘", steel, loc=(0, 0, height / 2 + 0.3), scale=(4.0, 4.0, 0.4))
    tube("天线杆", steel, loc=(0, 0, height / 2 + 2.0), scale=(0.22, 0.22, 3.4))
    ball("顶灯", lamp, loc=(0, 0, height / 2 + 3.8), scale=(0.7, 0.7, 0.7))
    box("底座", steel, loc=(0, 0, -height / 2 - 0.3), scale=(4.4, 4.4, 0.5))


def build_pylon_station():
    """废弃的空间站段:圆柱主体 + 两道法兰环 + 一对太阳能板。约 9 宽、20 高。"""
    reset_scene()
    shell = make_material("站体白装甲", (0.42, 0.44, 0.5), metal=0.72, rough=0.42)
    dark = make_material("站体暗件", (0.05, 0.05, 0.07), metal=0.9, rough=0.5)
    panel = make_material("太阳能板", (0.06, 0.08, 0.24), metal=0.55, rough=0.22,
                          emit=(0.1, 0.16, 0.5), emit_strength=1.6)
    win = make_material("舷窗灯", (1.0, 0.82, 0.45), metal=0.0, rough=0.2,
                        emit=(1.0, 0.78, 0.4), emit_strength=5.0)

    height = 18.0
    tube("主舱段", shell, loc=(0, 0, 0), scale=(4.4, 4.4, height), verts=14)
    for z in (-height / 2 + 1.2, 0.0, height / 2 - 1.2):
        tube("法兰环", dark, loc=(0, 0, z), scale=(5.0, 5.0, 0.7), verts=14)
    # 舷窗:一圈发光小块,比贴图便宜,远处只剩一串亮点,正好
    for i in range(8):
        a = i / 8 * math.tau
        box(f"舷窗{i}", win, loc=(math.cos(a) * 2.3, math.sin(a) * 2.3, 3.4),
            scale=(0.5, 0.5, 0.8), rot=(0, 0, a))
    tube("对接口", dark, loc=(0, 0, height / 2 + 1.2), scale=(2.2, 2.2, 2.0), verts=12)

    # 太阳能板:靠桁架臂伸出去,让轮廓横向拉开
    for sign in (1, -1):
        box(f"板臂{sign}", dark, loc=(sign * 4.4, 0, -1.0), scale=(4.0, 0.3, 0.3))
        box(f"电池板{sign}", panel, loc=(sign * 8.4, 0, -1.0), scale=(7.2, 0.16, 5.0))
        for k in range(3):
            box(f"板筋{sign}{k}", dark, loc=(sign * 8.4, 0, -1.0 + (k - 1) * 1.6),
                scale=(7.3, 0.2, 0.1))


def build_pylon_wreck():
    """战舰残骸:断成两截的舰体 + 裸露肋骨 + 未熄的余烬。约 6 宽、22 长。

    长轴沿 +Y —— 和战机同一套朝向约定,导出后在 Three.js 里就是躺着顺航道漂,
    掠过时像一具从战场漂过来的尸体。它是叙事道具:告诉玩家这条航道上先来过一批人。
    """
    reset_scene()
    hull = make_material("残骸装甲", (0.13, 0.12, 0.13), metal=0.85, rough=0.55)
    burn = make_material("烧灼断口", (0.06, 0.04, 0.04), metal=0.7, rough=0.75)
    rib = make_material("裸露肋骨", (0.2, 0.2, 0.23), metal=0.95, rough=0.3)
    ember = make_material("未熄余烬", (0.9, 0.3, 0.1), metal=0.0, rough=0.4,
                          emit=(1.0, 0.32, 0.08), emit_strength=4.0)

    # 前段:相对完整的舰艏。锥体默认沿 +Z,转 -90° 让尖端指向 +Y
    taper("舰艏", hull, loc=(0, 6.5, 0), scale=(4.4, 4.0, 9.0),
          rot=(math.radians(-90), 0, 0), tip=0.45)
    box("舰艏甲板", hull, loc=(0, 7.5, 0.9), scale=(2.6, 5.0, 1.2))
    box("断口A", burn, loc=(0, 1.8, 0), scale=(4.2, 0.6, 3.8), rot=(math.radians(7), 0, 0))

    # 中间裸露的龙骨:几根管子把两截连着,断口的故事就靠它讲
    for i, x in enumerate((-1.2, 0.0, 1.2)):
        tube(f"龙骨{i}", rib, loc=(x, 0.2, 0), scale=(0.35, 0.35, 3.4),
             rot=(math.radians(90), 0, 0))
    box("余烬芯", ember, loc=(0, 0.2, 0), scale=(1.1, 2.0, 1.1))

    # 后段:翻转错位的动力段,刻意不与前段同轴,读起来才像被撕开的
    taper("动力段", hull, loc=(0.6, -5.6, -0.4), scale=(4.0, 3.6, 8.0), tip=0.7,
          rot=(math.radians(-86), math.radians(6), math.radians(9)))
    box("断口B", burn, loc=(0.4, -1.9, -0.2), scale=(3.8, 0.6, 3.4), rot=(math.radians(-6), 0, 0))
    for i, x in enumerate((-1.3, 1.3)):
        tube(f"引擎{i}", rib, loc=(0.6 + x, -9.6, -0.4), scale=(1.5, 1.5, 1.6),
             rot=(math.radians(90), 0, 0))
        tube(f"引擎口{i}", burn, loc=(0.6 + x, -10.5, -0.4), scale=(1.3, 1.3, 0.3),
             rot=(math.radians(90), 0, 0))
    # 残翼:断了一半,轮廓上留个缺口
    box("残翼", hull, loc=(3.2, -3.0, -0.2), scale=(3.4, 3.0, 0.3), rot=(0, math.radians(14), 0))


# ---------------------------------------------------------------- 入口

BUILDERS = {
    "enemy-drone": build_enemy_drone,
    "boss-carrier": build_boss_carrier,
    # 场景结构物。它们不参与碰撞,只在两侧掠过,所以尺寸直接按最终世界单位建,
    # 不像战机那样进引擎后再归一化
    "prop-truss": build_pylon_truss,
    "prop-station": build_pylon_station,
    "prop-wreck": build_pylon_wreck,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0] if argv else "public/neon-strike/models"
    os.makedirs(out_dir, exist_ok=True)
    for name, build in BUILDERS.items():
        build()
        export(os.path.join(out_dir, f"{name}.glb"))


main()
