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


def hoop(name, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), major=20, thickness=0.035):
    """细环。ring() 的管径是按 major 的固定比例给的(0.09/0.5),在道具那种小尺寸上
    会胖成一个甜甜圈,所以单独开一个能指定管径的。"""
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major, minor_segments=6, major_radius=0.5, minor_radius=thickness,
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
    # 竖直霓虹灯带:第一版只有舷窗,整体太"现实空间站"、不够霓虹。
    # 灯带在高速掠过时会拉成亮线,和桁架塔用的是同一个手法
    neon = make_material("站体霓虹带", (0.2, 0.7, 1.0), metal=0.0, rough=0.2,
                         emit=(0.25, 0.8, 1.0), emit_strength=5.0)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        # 半径 2.3:tube 的 scale 给的是直径,主舱段 4.4 对应半径 2.2,灯带要贴着壳走
        box(f"霓虹带{i}", neon, loc=(math.cos(a) * 2.3, math.sin(a) * 2.3, 0),
            scale=(0.3, 0.3, height * 0.72), rot=(0, 0, a))
    tube("对接口灯环", neon, loc=(0, 0, height / 2 + 2.3), scale=(2.4, 2.4, 0.35), verts=12)

    # 太阳能板:靠桁架臂伸出去,让轮廓横向拉开
    for sign in (1, -1):
        box(f"板臂{sign}", dark, loc=(sign * 4.4, 0, -1.0), scale=(4.0, 0.3, 0.3))
        box(f"电池板{sign}", panel, loc=(sign * 8.4, 0, -1.0), scale=(7.2, 0.16, 5.0))
        for k in range(3):
            box(f"板筋{sign}{k}", dark, loc=(sign * 8.4, 0, -1.0 + (k - 1) * 1.6),
                scale=(7.3, 0.2, 0.1))
        # 板框:纯平面在侧光下会整片消失,给它一圈厚边才始终有轮廓
        box(f"板框上{sign}", dark, loc=(sign * 8.4, 0, 1.5), scale=(7.4, 0.34, 0.3))
        box(f"板框下{sign}", dark, loc=(sign * 8.4, 0, -3.5), scale=(7.4, 0.34, 0.3))
        box(f"板框外{sign}", dark, loc=(sign * 12.0, 0, -1.0), scale=(0.3, 0.34, 5.2))


def build_pylon_wreck():
    """战舰残骸:断成两截、龙骨裸露、断口未熄。长轴沿 +Y,约 7 宽 × 22 长。

    第一版做成了两块灰板子 —— 剪影读不出"被撕开",龙骨还被舰体挡住。
    这一版把中段整个掏空:前后两截之间只剩一根细龙骨,外面套着几道肋骨环,
    于是轮廓在中间"细下去"再"粗回来",一眼就是断的。断口给锯齿状的错位碎块,
    余烬沿着断面铺开而不是塞在里面 —— 掠过时先看到的是那点橙红。
    """
    reset_scene()
    hull = make_material("残骸装甲", (0.13, 0.12, 0.13), metal=0.85, rough=0.55)
    burn = make_material("烧灼断口", (0.05, 0.035, 0.035), metal=0.7, rough=0.8)
    rib = make_material("裸露肋骨", (0.26, 0.26, 0.3), metal=0.95, rough=0.28)
    ember = make_material("未熄余烬", (0.9, 0.3, 0.1), metal=0.0, rough=0.4,
                          emit=(1.0, 0.34, 0.08), emit_strength=6.0)

    # 前段:相对完整的舰艏,带上层建筑,轮廓最粗
    taper("舰艏", hull, loc=(0, 7.6, 0), scale=(4.2, 3.6, 7.6),
          rot=(math.radians(-90), 0, 0), tip=0.4)
    box("舰艏甲板", hull, loc=(0, 8.4, 1.1), scale=(2.4, 4.2, 1.0))
    box("舰桥残块", hull, loc=(0, 6.4, 1.9), scale=(1.6, 1.8, 1.2), rot=(math.radians(-8), 0, 0))
    # 断面:一圈锯齿状碎块,大小和角度都不齐,才像撕的不像切的
    for i in range(7):
        a = i / 7 * math.tau
        box(f"前断齿{i}", burn, loc=(math.cos(a) * 1.6, 3.9 + (i % 3) * 0.35, math.sin(a) * 1.4),
            scale=(0.9 + (i % 2) * 0.5, 0.8, 0.5 + (i % 3) * 0.3),
            rot=(0, 0, a + 0.4))
    box("前断口余烬", ember, loc=(0, 3.7, 0), scale=(2.0, 0.3, 1.8))

    # 中段:只剩龙骨 + 几道肋骨环。轮廓在这里细下去,是"断了"的核心信号
    tube("龙骨", rib, loc=(0, 0.2, 0), scale=(0.75, 0.75, 6.2), rot=(math.radians(90), 0, 0))
    for i, y in enumerate((-1.9, -0.5, 0.9, 2.3)):
        ring(f"肋骨{i}", rib, loc=(0, y, 0), scale=(2.6 - abs(y) * 0.15, 2.6 - abs(y) * 0.15, 2.4),
             rot=(math.radians(90), 0, 0))
    box("龙骨电弧", ember, loc=(0, 0.6, 0), scale=(0.35, 3.0, 0.35))
    # 挂在龙骨上的碎片,让中段不至于太干净
    box("残片A", hull, loc=(1.6, 1.2, -0.6), scale=(1.4, 1.6, 0.3), rot=(0.4, 0.2, 0.6))
    box("残片B", hull, loc=(-1.4, -1.0, 0.7), scale=(1.2, 1.8, 0.3), rot=(-0.3, 0.5, -0.4))

    # 后段:动力段,和前段刻意不同轴 —— 同轴就成了"两截零件",不是"撕开的一条船"
    taper("动力段", hull, loc=(0.8, -6.4, -0.5), scale=(3.8, 3.2, 7.4), tip=0.75,
          rot=(math.radians(-84), math.radians(7), math.radians(11)))
    for i in range(5):
        a = i / 5 * math.tau
        box(f"后断齿{i}", burn, loc=(0.7 + math.cos(a) * 1.4, -3.0, -0.4 + math.sin(a) * 1.2),
            scale=(1.0, 0.7, 0.6), rot=(0, 0, a))
    box("后断口余烬", ember, loc=(0.7, -3.1, -0.4), scale=(1.7, 0.28, 1.5))

    # 尾部引擎:两具还在,一具只剩壳,不对称本身就是"受损"的语言
    for i, x in enumerate((-1.5, 1.5)):
        tube(f"引擎{i}", rib, loc=(0.8 + x, -9.8, -0.5), scale=(1.7, 1.7, 1.8),
             rot=(math.radians(90), 0, 0))
        tube(f"引擎口{i}", burn, loc=(0.8 + x, -10.8, -0.5), scale=(1.5, 1.5, 0.3),
             rot=(math.radians(90), 0, 0))
    box("破损舷侧板", hull, loc=(3.4, -5.6, -0.3), scale=(0.3, 4.0, 2.6), rot=(0, math.radians(12), 0))
    box("残翼", hull, loc=(-3.0, 5.0, 0.2), scale=(3.0, 3.4, 0.3), rot=(0, math.radians(-16), 0))


# ---------------------------------------------------------------- 航道障碍物(参与碰撞)

def build_obstacle_asteroid():
    """碎裂的小行星。直径约 3,可被击碎。

    形状语言刻意和敌机反着来:敌机是硬表面、对称、带自发光能量件,
    小行星是不规则、无光、纯反射 —— 玩家余光扫过就知道"这个不会还手,但会撞死我"。
    """
    reset_scene()
    rock = make_material("岩体", (0.16, 0.14, 0.15), metal=0.25, rough=0.92)
    vein = make_material("矿脉", (0.35, 0.5, 0.6), metal=0.9, rough=0.35)
    heat = make_material("再入余温", (0.8, 0.28, 0.12), metal=0.0, rough=0.5,
                         emit=(1.0, 0.35, 0.1), emit_strength=2.4)

    # 主体是被压扁拉歪的球,再挂几块凸起 —— 低模下不规则感全靠这几块打破对称
    ball("主岩体", rock, loc=(0, 0, 0), scale=(3.0, 2.6, 2.8), subdiv=2)
    ball("凸起A", rock, loc=(0.9, 0.5, 0.7), scale=(1.5, 1.4, 1.2), subdiv=1)
    ball("凸起B", rock, loc=(-1.0, -0.4, -0.5), scale=(1.3, 1.6, 1.4), subdiv=1)
    ball("凸起C", rock, loc=(0.2, -1.1, 0.6), scale=(1.1, 1.0, 1.3), subdiv=1)
    # 矿脉与余温:纯灰岩块在深色背景里会整个沉下去,得有两处能反光/发光的落点
    box("矿脉A", vein, loc=(0.4, 1.2, 0.2), scale=(1.4, 0.3, 0.5), rot=(0.3, 0.2, 0.7))
    box("矿脉B", vein, loc=(-0.8, 0.3, 1.1), scale=(0.3, 1.2, 0.4), rot=(0.6, 0, 0.2))
    box("余温缝", heat, loc=(0.9, -0.6, -0.9), scale=(0.9, 0.22, 0.22), rot=(0, 0.4, 0.3))


def build_obstacle_mine():
    """太空水雷。直径约 2(含刺 4),可被击落,碰到就炸。

    带刺 + 红光是"雷"的通用语汇,不需要教学。刺做成多向对称,任何角度轮廓都一样 ——
    玩家不必判断朝向,只需要判断"别碰"。

    发光件走赤道环和刺根的灯点,不做发光内核:内核只要有一丝比外壳大就会从球面上
    戳出斑块,而球体又是最不适合藏东西的形状(第一版就是这么糊掉的)。
    """
    reset_scene()
    shell = make_material("雷体外壳", (0.09, 0.09, 0.11), metal=0.9, rough=0.4)
    spike = make_material("触发刺", (0.3, 0.3, 0.34), metal=0.95, rough=0.22)
    warn = make_material("警戒灯", (1.0, 0.15, 0.15), metal=0.0, rough=0.2,
                         emit=(1.0, 0.12, 0.1), emit_strength=9.0)

    ball("雷体", shell, loc=(0, 0, 0), scale=(1.45, 1.45, 1.45), subdiv=2)
    # 赤道环是整颗雷最亮的一圈,远处只剩这一环时仍然认得出
    # 注意:ball / ring 的 scale 给的是直径,雷体半径只有 0.72,贴壳的件都要按这个算
    # Z 方向压扁,把环从"甜甜圈"压成贴在壳上的一道箍;torus 的管径是按 major 的固定比例来的,
    # 不压的话在这个尺寸下会胖得像个救生圈
    ring("警戒环", warn, loc=(0, 0, 0), scale=(1.58, 1.58, 0.42), rot=(math.radians(90), 0, 0))
    ring("加固环", spike, loc=(0, 0, 0), scale=(1.5, 1.5, 0.4), rot=(0, math.radians(90), 0))

    # 六向主刺:细长才有"刺"的读感,第一版又粗又短,读成了球上的疙瘩
    for i, (rx, ry) in enumerate(((0, 0), (math.pi, 0), (math.pi / 2, 0),
                                  (-math.pi / 2, 0), (0, math.pi / 2), (0, -math.pi / 2))):
        wedge(f"主刺{i}", spike, loc=(0, 0, 0), scale=(0.3, 0.3, 3.4), rot=(rx, ry, 0))
    # 刺根灯点:六个小红点跟着刺走,顺带把刺和球体在视觉上焊在一起
    for i, (x, y, z) in enumerate(((0, 0, 0.68), (0, 0, -0.68), (0, 0.68, 0),
                                   (0, -0.68, 0), (0.68, 0, 0), (-0.68, 0, 0))):
        ball(f"刺根灯{i}", warn, loc=(x, y, z), scale=(0.34, 0.34, 0.34), subdiv=1)
    # 四根斜刺补满轮廓,让任意角度看过去都是"带刺的"
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        wedge(f"斜刺{i}", spike, loc=(0, 0, 0), scale=(0.24, 0.24, 2.9),
              rot=(math.radians(55), 0, a))


def build_obstacle_block():
    """废弃货舱段。约 3.4 × 2.2 × 2.4,打不碎,只能绕。

    方正、厚重、带集装箱肋 —— 唯一一个"看起来就打不动"的形状。
    可摧毁的两种都是圆的(岩块、雷),不可摧毁的这个是方的:
    形状本身就是规则说明,玩家不需要试错两次才学会。
    """
    reset_scene()
    steel = make_material("货舱装甲", (0.2, 0.21, 0.24), metal=0.92, rough=0.34)
    dark = make_material("货舱暗件", (0.05, 0.05, 0.07), metal=0.9, rough=0.5)
    stripe = make_material("危险条纹", (1.0, 0.66, 0.1), metal=0.0, rough=0.3,
                           emit=(1.0, 0.62, 0.12), emit_strength=3.2)

    box("舱体", steel, loc=(0, 0, 0), scale=(3.4, 2.4, 2.2))
    # 集装箱肋:三道竖肋 + 两端法兰,让方块在旋转时有明确的转动感
    for i, x in enumerate((-1.0, 0.0, 1.0)):
        box(f"竖肋{i}", dark, loc=(x, 0, 0), scale=(0.28, 2.5, 2.3))
    box("前法兰", dark, loc=(0, 1.3, 0), scale=(3.5, 0.3, 2.3))
    box("后法兰", dark, loc=(0, -1.3, 0), scale=(3.5, 0.3, 2.3))
    # 危险条纹:唯一的发光件,给的是"这东西是障碍不是敌人"的色彩信号(琥珀 ≠ 敌机的红/紫)
    for i, z in enumerate((0.75, -0.75)):
        box(f"条纹{i}", stripe, loc=(0, 1.32, z), scale=(3.0, 0.34, 0.3))
    box("侧灯", stripe, loc=(1.72, 0, 0), scale=(0.3, 1.6, 0.34))


# ---------------------------------------------------------------- 道具(拾取物)

def _pickup_halo(frame, glow):
    """三种道具共用的外圈:一道发光细环 + 四个深色角标。

    共用外形是"这是可以吃的东西"的统一语汇 —— 玩家不必逐个学,看到这圈就知道往上撞;
    内芯才负责区分是哪一种。

    环必须是发光件、且压得很扁:第一版拿深色框架做环、又没压扁,结果整个道具
    读成一个黑甜甜圈,内芯全被挡在里面。深色件在这个尺寸上只配当角标。
    """
    hoop("能量环", glow, loc=(0, 0, 0), scale=(1.72, 1.72, 1.0), rot=(math.radians(90), 0, 0))
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        box(f"角标{i}", frame, loc=(math.cos(a) * 0.81, 0, math.sin(a) * 0.81),
            scale=(0.26, 0.16, 0.16), rot=(0, math.radians(-a * 57.2958) if False else 0, 0))


def build_pickup_shield():
    """护盾道具:发光六边盾面 + 能量环。约 1.6 见方。

    盾形是所有游戏里最不需要解释的图形。六边面在远处退化成一个亮六边形,
    和另外两种(尖的、十字的)在剪影上一眼分得开。
    """
    reset_scene()
    frame = make_material("道具框架", (0.14, 0.16, 0.2), metal=0.92, rough=0.3)
    glow = make_material("护盾青绿", (0.25, 0.95, 0.6), metal=0.0, rough=0.2,
                         emit=(0.28, 0.96, 0.62), emit_strength=7.0)
    core = make_material("护盾亮芯", (0.75, 1.0, 0.88), metal=0.0, rough=0.15,
                         emit=(0.8, 1.0, 0.9), emit_strength=11.0)

    _pickup_halo(frame, glow)
    # 六边盾面。tube 的 verts 才是边数;taper 是写死的四棱台,拿它做不出六边形
    # 只留一片发光六边盾面:上一版在它前面又叠了一圈深色盾缘,直接把盾面全挡住了
    tube("盾面", glow, loc=(0, 0, 0), scale=(1.34, 1.34, 0.2), rot=(math.radians(90), 0, 0), verts=6)
    ball("中央亮芯", core, loc=(0, -0.16, 0), scale=(0.5, 0.3, 0.5), subdiv=1)


def build_pickup_weapon():
    """火力道具:向上的双层箭簇 + 能量环。约 1.6 见方。

    箭簇 = 升级,通用语汇。做成双层是为了让剪影有层次,
    单层三角在远处会和敌机的楔形机头混淆。
    """
    reset_scene()
    frame = make_material("道具框架", (0.14, 0.16, 0.2), metal=0.92, rough=0.3)
    glow = make_material("火力琥珀", (1.0, 0.7, 0.22), metal=0.0, rough=0.2,
                         emit=(1.0, 0.68, 0.2), emit_strength=7.0)
    core = make_material("火力亮芯", (1.0, 0.94, 0.75), metal=0.0, rough=0.15,
                         emit=(1.0, 0.92, 0.7), emit_strength=11.0)

    _pickup_halo(frame, glow)
    # 两片人字:上面一片小一点,读起来是"再上一级"。厚度给足,侧面也认得出
    # 不加旋转:cone 默认尖端就朝 +Z(向上)。上一版转了 -90°,尖端戳向镜头,
    # 正面看只剩一个菱形,"箭头"这个语义整个丢了
    for i, (z, k, mat) in enumerate(((0.34, 1.0, glow), (-0.3, 0.8, core))):
        wedge(f"箭簇{i}", mat, loc=(0, 0, z), scale=(1.25 * k, 0.3, 0.8 * k))
    box("底座", frame, loc=(0, 0, -0.66), scale=(0.86, 0.24, 0.14))


def build_pickup_life():
    """命数道具:立体十字 + 能量环。约 1.6 见方。

    十字是"补给/回复"最强的既有符号,而且它是三种里唯一带直角缺口的剪影 ——
    辉光把颜色糊成一团时,形状必须还认得出。
    """
    reset_scene()
    frame = make_material("道具框架", (0.14, 0.16, 0.2), metal=0.92, rough=0.3)
    glow = make_material("命数品红", (1.0, 0.37, 0.54), metal=0.0, rough=0.2,
                         emit=(1.0, 0.35, 0.52), emit_strength=7.0)
    core = make_material("命数亮芯", (1.0, 0.85, 0.9), metal=0.0, rough=0.15,
                         emit=(1.0, 0.82, 0.88), emit_strength=11.0)

    _pickup_halo(frame, glow)
    box("竖臂", glow, loc=(0, 0, 0), scale=(0.44, 0.36, 1.46))
    box("横臂", glow, loc=(0, 0, 0), scale=(1.46, 0.36, 0.44))
    box("竖臂芯", core, loc=(0, -0.21, 0), scale=(0.2, 0.08, 1.18))
    box("横臂芯", core, loc=(0, -0.21, 0), scale=(1.18, 0.08, 0.2))


# ---------------------------------------------------------------- 入口

BUILDERS = {
    "enemy-drone": build_enemy_drone,
    "boss-carrier": build_boss_carrier,
    # 场景结构物。它们不参与碰撞,只在两侧掠过,所以尺寸直接按最终世界单位建,
    # 不像战机那样进引擎后再归一化
    "prop-truss": build_pylon_truss,
    "prop-station": build_pylon_station,
    "prop-wreck": build_pylon_wreck,
    # 航道障碍物。这三个参与碰撞,尺寸直接按世界单位建,进引擎后不再归一化
    "obstacle-asteroid": build_obstacle_asteroid,
    "obstacle-mine": build_obstacle_mine,
    "obstacle-block": build_obstacle_block,
    # 道具。颜色在模型里就烤死,引擎侧不再按种类改材质
    "pickup-shield": build_pickup_shield,
    "pickup-weapon": build_pickup_weapon,
    "pickup-life": build_pickup_life,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0] if argv else "public/neon-strike/models"
    os.makedirs(out_dir, exist_ok=True)
    for name, build in BUILDERS.items():
        build()
        export(os.path.join(out_dir, f"{name}.glb"))


main()
