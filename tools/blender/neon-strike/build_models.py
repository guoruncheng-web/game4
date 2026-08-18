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
import mathutils


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
    # 顺带把包围盒打出来:引擎侧的归一化和 BOSS_SPEC.half 都要按这个尺寸换算,
    # 靠肉眼估模型尺寸必然对不上判定盒
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            world = o.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    dims = tuple(round(hi[i] - lo[i], 2) for i in range(3))
    print(f"EXPORTED {path} tris={tris} size={os.path.getsize(path)} dims(x,y,z)={dims}")


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
    """核心战舰(CORE CARRIER):王冠母舰。约 14 宽 × 13 长 × 8.5 高。

    上一版已经有"环 + 核心"的负空间,但它还是一个平的圆环 —— 从玩家视角看过去,
    整艘船的信息全压在一个平面上,没有任何东西朝你伸过来,所以只是"大",不"凶"。

    这一版加的是**指向玩家的体量**:
    - 环外缘长出一圈冠刺,轮廓从"圆"变成"王冠",不再是个规整的工业零件;
    - 四条巨爪从环上向前环抱过来,爪尖是炮口 —— 玩家被四门炮夹在中间;
    - 核心外面罩一层半开的虹膜装甲,只从正面那道缝里漏光,
      "要打的地方"从一颗裸球变成一道快闭上的缝,压迫感和可读性都在;
    - 舰体加高加厚、引擎从五个排成七个,后面的体量撑得住前面的爪。

    机头朝 +Y,环躺在 XZ 平面上(Z 是上)。
    """
    reset_scene()
    hull = make_material("Boss 暗紫装甲", (0.07, 0.05, 0.105), metal=0.86, rough=0.36)
    plate = make_material("Boss 深色机械", (0.03, 0.03, 0.045), metal=0.92, rough=0.52)
    trim = make_material("Boss 钛灰装甲", (0.2, 0.21, 0.26), metal=0.9, rough=0.28)
    core = make_material("Boss 核心能量", (0.95, 0.2, 0.45), metal=0.0, rough=0.18,
                         emit=(1.0, 0.24, 0.5), emit_strength=9.0)
    glow = make_material("Boss 舷灯", (0.35, 0.85, 1.0), metal=0.0, rough=0.2,
                         emit=(0.4, 0.9, 1.0), emit_strength=5.0)

    # ---- 后段舰体:所有结构的根。它不需要好看,需要够重 —— 前面伸出去的爪子
    # 全靠它在视觉上配平,舰体单薄的话整艘船会读成"一个环在飘"
    taper("主舰体", hull, loc=(0, -3.4, 0), scale=(7.6, 2.3, 6.0),
          rot=(math.radians(-90), 0, 0), tip=0.46)
    box("舰腹装甲", plate, loc=(0, -3.6, -1.5), scale=(6.0, 5.6, 1.0))
    box("脊背一层", trim, loc=(0, -3.2, 1.5), scale=(3.0, 4.6, 0.7))
    box("脊背二层", trim, loc=(0, -4.0, 2.3), scale=(2.2, 3.0, 0.9))
    box("舰桥", trim, loc=(0, -4.6, 3.1), scale=(1.7, 1.8, 0.8))
    box("舰桥窗", glow, loc=(0, -5.4, 3.1), scale=(1.3, 0.24, 0.26))
    # 舰体上的高塔:把剪影往上顶,俯视视角下这一维最容易被压扁
    for i, (x, h) in enumerate(((-2.3, 1.6), (2.3, 1.6))):
        box(f"侧塔{i}", plate, loc=(x, -3.8, 1.9), scale=(0.7, 1.4, h))
        box(f"侧塔灯{i}", glow, loc=(x, -3.8, 1.9 + h * 0.5), scale=(0.5, 0.5, 0.16))

    # ---- 主环:十二段折线环,环面正对玩家。全场唯一的巨型圆环,是这艘船的身份
    RING_R, RING_Y = 4.8, 2.1
    SEGMENTS = 12
    seg_len = 2 * RING_R * math.tan(math.pi / SEGMENTS) * 1.08
    for i in range(SEGMENTS):
        a = (i + 0.5) / SEGMENTS * math.tau
        # 环躺在 XZ 平面上,切线方向要绕 Y 轴转;绕 Z 转只会让各段各转各的,拼不成环
        box(f"环段{i}", hull,
            loc=(math.cos(a) * RING_R, RING_Y, math.sin(a) * RING_R),
            scale=(seg_len, 1.5, 1.25), rot=(0, -(a + math.pi / 2), 0))
        box(f"环槽{i}", core,
            loc=(math.cos(a) * (RING_R - 0.7), RING_Y + 0.35, math.sin(a) * (RING_R - 0.7)),
            scale=(seg_len * 0.74, 0.4, 0.3), rot=(0, -(a + math.pi / 2), 0))
        # 冠刺:一圈朝外的尖刺,长短交替。轮廓从"圆环"变成"王冠",
        # 远处黑影里也能读出攻击性 —— 规整的圆是工业件,带刺的圆才是战舰
        k = 1.0 if i % 2 == 0 else 0.6
        wedge(f"冠刺{i}", trim,
              loc=(math.cos(a) * (RING_R + 0.9 * k), RING_Y, math.sin(a) * (RING_R + 0.9 * k)),
              scale=(0.8 * k, 0.8 * k, 2.2 * k),
              rot=(0, math.pi / 2 - a, 0))

    # ---- 环上的四个节点:巨爪的根,加装甲块让八边形不至于太规整
    NODES = [i / 4 * math.tau + math.pi / 4 for i in range(4)]
    for i, a in enumerate(NODES):
        box(f"环节点{i}", trim, loc=(math.cos(a) * RING_R, RING_Y, math.sin(a) * RING_R),
            scale=(1.7, 2.1, 1.7), rot=(0, -a, 0))

    # ---- 四条巨爪:从环上向前环抱。整艘船唯一朝玩家伸过来的东西,
    # "凶"和"大"的差别就在这儿 —— 爪尖是四门炮,玩家被夹在中间打
    tilt = math.radians(11)
    for i, a in enumerate(NODES):
        # 小角度近似:绕 X 抬头 + 绕 Z 偏航,合起来让 +Y 朝内收
        rot = (-math.sin(a) * tilt, 0, math.cos(a) * tilt)
        rx, rz = math.cos(a) * (RING_R + 0.25), math.sin(a) * (RING_R + 0.25)
        box(f"爪上臂{i}", hull, loc=(rx, RING_Y + 2.7, rz), scale=(1.9, 5.6, 1.7), rot=rot)
        # 臂外侧的甲板:正面看过去,爪子的宽度全靠它。没有这一片,四条爪在
        # 透视压缩下只剩四根针,读成"蜘蛛腿"而不是"环抱过来的手臂"
        box(f"爪外甲{i}", hull, loc=(rx * 1.16, RING_Y + 2.4, rz * 1.16),
            scale=(1.5, 4.8, 0.5), rot=(rot[0], -a, rot[2]))
        box(f"爪上臂槽{i}", core, loc=(rx * 0.88, RING_Y + 2.7, rz * 0.88),
            scale=(1.1, 4.4, 0.26), rot=rot)
        # 前臂再往里收一截,四只爪在正前方合出一个更小的口
        fx, fz = math.cos(a) * (RING_R - 1.1), math.sin(a) * (RING_R - 1.1)
        box(f"爪前臂{i}", trim, loc=(fx, RING_Y + 6.4, fz), scale=(1.5, 3.4, 1.35),
            rot=(-math.sin(a) * tilt * 2.6, 0, math.cos(a) * tilt * 2.6))
        cx, cz = math.cos(a) * (RING_R - 2.3), math.sin(a) * (RING_R - 2.3)
        box(f"爪炮座{i}", plate, loc=(cx, RING_Y + 7.9, cz), scale=(1.6, 1.4, 1.6))
        tube(f"爪主炮{i}", plate, loc=(cx, RING_Y + 8.9, cz), scale=(0.62, 0.62, 1.8),
             rot=(math.radians(90), 0, 0))
        tube(f"爪炮口{i}", core, loc=(cx, RING_Y + 9.9, cz), scale=(0.42, 0.42, 0.24),
             rot=(math.radians(90), 0, 0))
        wedge(f"爪刺{i}", trim, loc=(cx * 1.35, RING_Y + 7.4, cz * 1.35),
              scale=(0.55, 0.55, 2.0), rot=(math.radians(-90), 0, 0))

    # ---- 环心:虹膜装甲 + 核心。八片装甲斜着围住核心,只从正面漏光。
    # 裸球是"一个靶子",半闭的虹膜是"它在戒备" —— 同样是打这里,后者才有交战感
    ball("核心球", core, loc=(0, RING_Y, 0), scale=(2.2, 2.0, 2.2))
    for i in range(8):
        a = i / 8 * math.tau
        box(f"虹膜{i}", trim,
            loc=(math.cos(a) * 2.15, RING_Y - 0.1, math.sin(a) * 2.15),
            scale=(1.9, 1.5, 0.34), rot=(math.radians(42), -(a + math.pi / 2), 0))
    hoop("核心细环", trim, loc=(0, RING_Y, 0), scale=(3.3, 3.3, 3.3),
         rot=(math.radians(90), 0, 0), thickness=0.06)
    hoop("核心斜环", glow, loc=(0, RING_Y + 0.4, 0), scale=(2.9, 2.9, 2.9),
         rot=(math.radians(90), math.radians(40), 0), thickness=0.045)

    # ---- 把环架在舰体前方的四根斜撑
    for i in range(4):
        a = i / 4 * math.tau
        box(f"环撑{i}", plate,
            loc=(math.cos(a) * RING_R * 0.74, RING_Y - 2.8, math.sin(a) * RING_R * 0.74),
            scale=(0.5, 5.2, 0.5), rot=(math.radians(-13), 0, 0))

    # ---- 下挂机库:六个朝前的发射口,交代"每波敌机是从这儿放出来的"
    box("机库舱", hull, loc=(0, -1.0, -2.3), scale=(9.0, 3.6, 1.4))
    for i, x in enumerate((-3.5, -2.1, -0.7, 0.7, 2.1, 3.5)):
        box(f"机库口{i}", plate, loc=(x, 0.75, -2.3), scale=(0.95, 0.7, 0.9))
        box(f"机库灯{i}", glow, loc=(x, 1.08, -2.3), scale=(1.0, 0.14, 0.5))

    # ---- 两侧吊舱:横向轮廓撑到环之外,读到的顺序才是
    # "很大一坨 → 中间有个带刺的环 → 环心有条亮缝"
    pod = taper("右吊舱", hull, loc=(6.2, -2.0, -0.3), scale=(2.1, 1.8, 5.0),
                rot=(math.radians(-90), 0, 0), tip=0.42)
    mirror_x(pod, "左吊舱")
    for j, (dz, s) in enumerate(((0.75, 1.0), (-0.75, 0.8))):
        pg = tube(f"右吊舱主炮{j}", plate, loc=(6.2, 1.4, -0.3 + dz), scale=(0.6 * s, 0.6 * s, 3.0),
                  rot=(math.radians(90), 0, 0))
        mirror_x(pg, f"左吊舱主炮{j}")
        pm = tube(f"右吊舱炮口{j}", core, loc=(6.2, 3.0, -0.3 + dz), scale=(0.5 * s, 0.5 * s, 0.24),
                  rot=(math.radians(90), 0, 0))
        mirror_x(pm, f"左吊舱炮口{j}")
    pv = box("右吊舱能量槽", core, loc=(6.2, -2.2, 1.05), scale=(0.34, 3.2, 0.18))
    mirror_x(pv, "左吊舱能量槽")

    # ---- 尾部推进阵列:七个,大小不均。均匀排布像民用件,不均匀才像军舰
    for i, (x, k) in enumerate(((-3.1, 0.6), (-2.1, 0.85), (-0.9, 1.15), (0.35, 1.15),
                                (1.6, 0.85), (2.6, 0.7), (3.4, 0.5))):
        tube(f"{i}号引擎", plate, loc=(x, -6.0, 0.1), scale=(1.0 * k, 1.0 * k, 1.3),
             rot=(math.radians(90), 0, 0))
        tube(f"{i}号尾焰", core, loc=(x, -6.7, 0.1), scale=(0.78 * k, 0.78 * k, 0.14),
             rot=(math.radians(90), 0, 0))

    # ---- 侧翼稳定板:最宽处再往外撑一点
    fin = box("右稳定板", hull, loc=(5.2, -3.4, 0.6), scale=(1.5, 3.2, 0.32),
              rot=(0, math.radians(-20), 0))
    mirror_x(fin, "左稳定板")
    fl = box("右舷灯", glow, loc=(5.2, -4.6, 0.6), scale=(1.7, 0.18, 0.12))
    mirror_x(fl, "左舷灯")


def build_boss_lancer():
    """虚空刺枪(VOID LANCER):三叉戟歼击舰。约 14 宽 × 20 长 × 6 高。

    三场 Boss 必须靠剪影区分,不能靠配色 —— 它们在 Bloom 下都是一团亮光。
    母舰是"带刺的环",这一艘走完全相反的路:**一把叉**。

    上一版是单根矛。单根矛的问题是它太"细":玩家正面看它,矛身被透视压成一个点,
    剩下的全靠四片翼撑着,读出来是"一个 X",不是一把武器。
    这一版给它三根枪管 —— 中间一根巨矛、两侧两根副矛,三个尖同时对着你,
    加上主炮外面那层张开的八片装甲颚,才有"这东西是来穿人的"那种意思。

    核心裸露在主炮根部的肋笼里 —— 想打它就得往三个枪口正中间凑。
    """
    reset_scene()
    hull = make_material("刺枪暗紫装甲", (0.075, 0.048, 0.125), metal=0.88, rough=0.33)
    plate = make_material("刺枪深色机械", (0.03, 0.03, 0.045), metal=0.92, rough=0.5)
    trim = make_material("刺枪钛灰装甲", (0.21, 0.21, 0.27), metal=0.9, rough=0.26)
    core = make_material("刺枪核心能量", (0.78, 0.42, 1.0), metal=0.0, rough=0.18,
                         emit=(0.76, 0.42, 1.0), emit_strength=9.0)
    glow = make_material("刺枪舷灯", (0.45, 0.85, 1.0), metal=0.0, rough=0.2,
                         emit=(0.5, 0.9, 1.0), emit_strength=5.0)

    # ---- 主炮管:整艘船的身份。够长才叫矛
    tube("加速炮管", trim, loc=(0, 4.6, 0), scale=(1.9, 1.9, 10.4), rot=(math.radians(90), 0, 0))
    tube("炮口", core, loc=(0, 9.9, 0), scale=(1.6, 1.6, 0.55), rot=(math.radians(90), 0, 0))
    wedge("枪尖", trim, loc=(0, 11.2, 0), scale=(1.7, 1.7, 2.6), rot=(math.radians(-90), 0, 0))
    # 枪尖四片破甲刃:尖端不是一个点而是一组刃,近看才有细节撑得住
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        box(f"破甲刃{i}", trim, loc=(math.cos(a) * 0.85, 10.4, math.sin(a) * 0.85),
            scale=(1.5, 2.6, 0.28), rot=(math.radians(-16), -a, 0))
    # 炮管上的加速环:五道,把"这是一门在蓄能的炮"讲清楚
    for i, y in enumerate((0.9, 2.9, 4.9, 6.9, 8.6)):
        hoop(f"加速环{i}", core, loc=(0, y, 0), scale=(2.9, 2.9, 2.9),
             rot=(math.radians(90), 0, 0), thickness=0.07)
        box(f"环卡箍{i}", plate, loc=(0, y, 0), scale=(3.0, 0.5, 0.42))
        box(f"环卡箍竖{i}", plate, loc=(0, y, 0), scale=(0.42, 0.5, 3.0))

    # ---- 主炮外的装甲颚:八片朝前张开的长条。它给主炮加了一圈"厚度",
    # 正面看过去就不再是一根细针,而是一个张着口的枪套
    for i in range(8):
        a = i / 8 * math.tau + math.pi / 8
        # 往外张 14°:平行于炮管的话正面只是一圈同心线,张开才有喇叭口,
        # 玩家正对它时看到的是一圈朝自己扩开的甲片,而不是一根光溜溜的管子
        box(f"炮颚{i}", hull, loc=(math.cos(a) * 3.1, 3.4, math.sin(a) * 3.1),
            scale=(2.1, 7.2, 0.5), rot=(math.radians(14), -(a + math.pi / 2), 0))
        box(f"炮颚灯{i}", core, loc=(math.cos(a) * 3.45, 3.2, math.sin(a) * 3.45),
            scale=(0.36, 5.6, 0.16), rot=(math.radians(14), -(a + math.pi / 2), 0))
        wedge(f"炮颚尖{i}", trim, loc=(math.cos(a) * 4.2, 7.2, math.sin(a) * 4.2),
              scale=(1.1, 1.1, 2.4), rot=(math.radians(-74), -a, 0))

    # ---- 两根副矛:三叉戟的两侧齿。比主矛短一截,尖端错开,
    # 三个尖不齐平才有纵深 —— 齐平会读成一堵栅栏
    for sign in (1, -1):
        px = sign * 4.6
        tube(f"副炮管{sign}", trim, loc=(px, 3.2, 0), scale=(1.15, 1.15, 7.6),
             rot=(math.radians(90), 0, 0))
        tube(f"副炮口{sign}", core, loc=(px, 7.1, 0), scale=(0.95, 0.95, 0.4),
             rot=(math.radians(90), 0, 0))
        wedge(f"副枪尖{sign}", trim, loc=(px, 8.1, 0), scale=(1.1, 1.1, 1.9),
              rot=(math.radians(-90), 0, 0))
        for j, y in enumerate((1.6, 3.6, 5.6)):
            hoop(f"副加速环{sign}{j}", core, loc=(px, y, 0), scale=(1.8, 1.8, 1.8),
                 rot=(math.radians(90), 0, 0), thickness=0.06)
        # 把副矛接到舰体上的斜撑
        box(f"副矛撑{sign}", plate, loc=(px * 0.62, -0.4, 0), scale=(4.6, 1.1, 0.75),
            rot=(0, 0, math.radians(-8) * sign))

    # ---- 中段舰体、肋笼与裸露核心
    taper("舰体", hull, loc=(0, -2.0, 0), scale=(3.6, 1.7, 6.0),
          rot=(math.radians(-90), 0, 0), tip=0.58)
    ball("核心球", core, loc=(0, -0.2, 0.4), scale=(2.0, 2.0, 1.8))
    for i in range(6):
        a = i / 6 * math.tau
        box(f"肋{i}", trim, loc=(math.cos(a) * 1.5, -0.2, 0.4 + math.sin(a) * 1.5),
            scale=(0.34, 2.6, 0.34), rot=(0, 0, 0))
    hoop("核心环", trim, loc=(0, -0.2, 0.4), scale=(3.1, 3.1, 3.1),
         rot=(math.radians(90), 0, 0), thickness=0.07)
    box("背脊", trim, loc=(0, -2.6, 1.5), scale=(1.7, 4.4, 0.6))

    # ---- X 形后掠翼:四片,绕炮管轴每 90° 一片。玩家正面看它时,
    # 矛身被透视压掉,撑起剪影的其实是这四片翼,所以翼展要够
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        box(f"翼{i}", hull, loc=(math.cos(a) * 4.4, -1.4, math.sin(a) * 4.4),
            scale=(8.2, 3.6, 0.48), rot=(0, -a, 0))
        box(f"翼灯{i}", glow, loc=(math.cos(a) * 6.1, -1.0, math.sin(a) * 6.1),
            scale=(5.4, 0.3, 0.2), rot=(0, -a, 0))
        # 翼尖前伸的镰刃:翼不再是一块板,而是一只朝前抓的爪
        box(f"翼刃{i}", trim, loc=(math.cos(a) * 8.0, -0.4, math.sin(a) * 8.0),
            scale=(1.8, 5.6, 0.7), rot=(0, -a, 0))
        box(f"翼刃灯{i}", core, loc=(math.cos(a) * 8.35, 0.4, math.sin(a) * 8.35),
            scale=(0.22, 3.6, 0.3), rot=(0, -a, 0))
        wedge(f"翼刃尖{i}", trim, loc=(math.cos(a) * 8.0, 2.8, math.sin(a) * 8.0),
              scale=(1.4, 0.6, 2.6), rot=(math.radians(-90), -a, 0))
        box(f"翼根舱{i}", plate, loc=(math.cos(a) * 2.2, -1.6, math.sin(a) * 2.2),
            scale=(1.7, 3.8, 1.1), rot=(0, -a, 0))
        tube(f"翼挂炮{i}", plate, loc=(math.cos(a) * 5.2, 1.2, math.sin(a) * 5.2),
             scale=(0.42, 0.42, 3.0), rot=(math.radians(90), 0, 0))
        tube(f"翼挂炮口{i}", core, loc=(math.cos(a) * 5.2, 2.8, math.sin(a) * 5.2),
             scale=(0.36, 0.36, 0.2), rot=(math.radians(90), 0, 0))

    # ---- 尾部:四大两小推进,重心视觉上压在后面,矛才"戳得动"
    box("引擎座", plate, loc=(0, -4.8, 0), scale=(5.2, 2.2, 2.4))
    for i, (x, z, k) in enumerate(((-2.0, 0.5, 1.0), (2.0, 0.5, 1.0),
                                   (-1.3, -0.9, 0.7), (1.3, -0.9, 0.7))):
        tube(f"{i}号引擎", plate, loc=(x, -5.6, z), scale=(1.6 * k, 1.6 * k, 2.0),
             rot=(math.radians(90), 0, 0))
        tube(f"{i}号尾焰", core, loc=(x, -6.8, z), scale=(1.25 * k, 1.25 * k, 0.18),
             rot=(math.radians(90), 0, 0))


def build_boss_eater():
    """吞星者(STAR EATER):巨口母舰。约 16 宽 × 14 长 × 11 高。

    第三种剪影必须和"带刺的环"、"三叉戟"都不像 —— 这一艘是**一张张开的嘴**。
    上下两片巨颚向前张开,三排齿,喉咙深处是烧着的胃核,嘴里还卡着一块没消化完的岩体。
    它不是飞行器造型,是生物造型,在一堆硬表面里天然扎眼。

    上一版嘴张得不够、也太干净。这一版补的是"这张嘴用过":
    颚外缘长出一排背棘、两条侧颚从下方朝前抄过来、颚上有纵向的肋 —— 咬合结构越具体,
    "堵住整条航道"这件事就越吓人。
    """
    reset_scene()
    hull = make_material("吞星者暗橙装甲", (0.115, 0.062, 0.035), metal=0.85, rough=0.4)
    plate = make_material("吞星者深色机械", (0.038, 0.032, 0.032), metal=0.92, rough=0.5)
    tooth = make_material("颚齿", (0.6, 0.57, 0.52), metal=0.9, rough=0.22)
    rock = make_material("未消化岩体", (0.14, 0.12, 0.11), metal=0.3, rough=0.85)
    core = make_material("胃核能量", (1.0, 0.55, 0.15), metal=0.0, rough=0.2,
                         emit=(1.0, 0.5, 0.12), emit_strength=10.0)
    glow = make_material("吞星者舷灯", (1.0, 0.75, 0.3), metal=0.0, rough=0.2,
                         emit=(1.0, 0.72, 0.25), emit_strength=4.5)

    # ---- 上下颚:两片厚板绕 X 轴张开约 60°。
    # 用板不用锥体:锥体的体积会把嘴填满,张角再大也看不出"张着",
    # 而板条在侧面留出的那道楔形空隙,才是"这是一张嘴"的全部信息量
    for sign, name in ((1, "上颚"), (-1, "下颚")):
        tilt = math.radians(34) * sign
        # 颚不是一整块方板:中间一块 + 两侧各一块后掠的翼板。
        # 一整块的话正面剪影是个矩形,读成推土机铲斗;
        # 后掠出来的斜边才让轮廓收成"喙",是活物而不是工程机械
        box(name, hull, loc=(0, 3.0, 2.0 * sign), scale=(10.0, 7.4, 1.25), rot=(tilt, 0, 0))
        for side in (1, -1):
            box(f"{name}侧板{side}", hull, loc=(side * 6.0, 2.2, 1.55 * sign),
                scale=(4.2, 6.4, 1.05), rot=(tilt, 0, math.radians(-13) * side))
            # 颚角上的獠牙:朝前上方翘出去,正面剪影的四个角就不再是直角
            wedge(f"{name}角牙{side}", tooth, loc=(side * 6.6, 6.0, 2.3 * sign),
                  scale=(1.2, 1.2, 3.4),
                  rot=(math.radians(-58) * sign, 0, math.radians(-20) * side))
        box(f"{name}外脊", plate, loc=(0, 2.4, 2.5 * sign), scale=(3.4, 5.8, 0.6), rot=(tilt, 0, 0))
        # 颚上的纵肋:让这块大板不再是一块平板,近距离也有东西看
        for i, x in enumerate((-5.0, -3.4, -1.8, 1.8, 3.4, 5.0)):
            box(f"{name}肋{i}", plate, loc=(x, 3.0, 2.35 * sign), scale=(0.5, 6.4, 0.35),
                rot=(tilt, 0, 0))
        # 三排齿:朝嘴里长,不是朝外支棱。齿尖方向直接按世界方向给
        # (上颚 ≈ 朝前下方,下颚镜像),不要跟着颚板的倾角走 ——
        # 跟着颚板转出来的是一排"从背上长出来的刺",侧面看像梳子,不像牙。
        # (y, 颚内表面高度, 基准大小, 齿长)
        for row, (fy, sz, ks, lz) in enumerate((
                (6.2, 2.95, 1.05, 2.9), (4.3, 2.30, 0.72, 2.0), (2.9, 1.75, 0.48, 1.3))):
            for i, x in enumerate((-5.4, -4.2, -3.0, -1.8, -0.6, 0.6, 1.8, 3.0, 4.2, 5.4)):
                k = ks * (1.0 if i % 2 == 0 else 0.62)
                # 齿根贴在颚的内表面上,整颗齿往嘴里伸
                wedge(f"{name}齿{row}_{i}", tooth,
                      loc=(x, fy, (sz - 0.45 * lz * k) * sign),
                      scale=(0.95 * k, 0.95 * k, lz * k),
                      rot=(math.radians(-153) * sign, 0, 0))
        # 缘灯打断成一段段夹在齿之间。一条通长的亮条在 Bloom 下会糊成日光灯管,
        # 把整排牙齿的形状全吃掉
        for i, x in enumerate((-4.8, -2.4, 0.0, 2.4, 4.8)):
            box(f"{name}缘灯{i}", glow, loc=(x, 6.7, 3.0 * sign), scale=(1.5, 0.34, 0.16),
                rot=(tilt, 0, 0))
        # 背棘:沿颚背排一列朝后的尖刺,轮廓从"两块板"变成"活物的脊"
        for i, y in enumerate((0.2, 1.4, 2.6, 3.8)):
            h = 2.4 - i * 0.35
            wedge(f"{name}棘{i}", tooth,
                  loc=(0, y, 3.4 * sign), scale=(0.85, 0.85, h),
                  rot=(math.radians(90) * sign + tilt * 0.4, 0, 0))

    # ---- 侧颚:两条从下方朝前抄的钳臂。上下颚管"高度",侧颚管"宽度",
    # 四片合起来才读成一个能把整条航道咬合掉的口器
    for sign in (1, -1):
        sx = sign * 6.4
        box(f"侧颚{sign}", hull, loc=(sx, 3.4, -0.4), scale=(1.5, 8.0, 3.4),
            rot=(0, 0, math.radians(-9) * sign))
        box(f"侧颚灯{sign}", core, loc=(sx - sign * 0.75, 3.4, -0.4), scale=(0.22, 6.0, 1.0))
        for i, y in enumerate((5.6, 4.0, 2.4)):
            k = 1.0 - i * 0.22
            wedge(f"侧颚齿{sign}{i}", tooth, loc=(sx - sign * 1.1, y, -0.4),
                  scale=(2.2 * k, 0.9 * k, 0.9 * k),
                  rot=(0, math.radians(-90) * sign, 0))
        wedge(f"侧颚尖{sign}", hull, loc=(sx - sign * 0.4, 7.6, -0.4), scale=(1.4, 1.4, 2.8),
              rot=(math.radians(-90), 0, math.radians(-10) * sign))

    # ---- 喉咙:三道往里收的环 + 胃核 + 一块没咽下去的岩体。
    # 环一层层缩小才有"深"的错觉,平铺一个亮球只会读成贴纸
    ball("胃核", core, loc=(0, 1.6, 0), scale=(3.4, 3.2, 3.4))
    for i, (y, s) in enumerate(((4.4, 5.6), (3.2, 4.6), (2.2, 3.8))):
        hoop(f"喉环{i}", plate if i == 0 else core, loc=(0, y, 0), scale=(s, s, s),
             rot=(math.radians(90), 0, 0), thickness=0.11 - i * 0.02)
    ball("未消化岩块", rock, loc=(1.5, 4.2, 0.9), scale=(2.0, 1.8, 1.9), subdiv=1)
    ball("岩屑", rock, loc=(-1.9, 3.4, -1.1), scale=(1.1, 1.0, 1.0), subdiv=1)

    # ---- 躯干与两侧推进荚:躯干短粗,把体量堆在颚后面
    taper("躯干", hull, loc=(0, -3.2, 0), scale=(7.6, 3.0, 5.8),
          rot=(math.radians(-90), 0, 0), tip=0.46)
    box("背甲", plate, loc=(0, -3.6, 2.6), scale=(3.2, 5.0, 0.8))
    for sign in (1, -1):
        tube(f"推进荚{sign}", hull, loc=(sign * 4.8, -2.6, 0), scale=(2.7, 2.7, 6.0),
             rot=(math.radians(90), 0, 0))
        box(f"荚灯{sign}", glow, loc=(sign * 4.8, -2.6, 1.4), scale=(0.32, 4.2, 0.22))
        tube(f"荚尾焰{sign}", core, loc=(sign * 4.8, -5.9, 0), scale=(2.2, 2.2, 0.22),
             rot=(math.radians(90), 0, 0))
        # 荚上的副炮:嘴是主要威胁,但它也得能还手
        tube(f"荚炮{sign}", plate, loc=(sign * 4.8, 1.2, 1.9), scale=(0.5, 0.5, 2.6),
             rot=(math.radians(90), 0, 0))
        tube(f"荚炮口{sign}", core, loc=(sign * 4.8, 2.6, 1.9), scale=(0.42, 0.42, 0.22),
             rot=(math.radians(90), 0, 0))
    tube("主尾焰", core, loc=(0, -6.2, 0), scale=(3.4, 3.4, 0.24), rot=(math.radians(90), 0, 0))


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
    "boss-lancer": build_boss_lancer,
    "boss-eater": build_boss_eater,
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
    """用法:blender -b --python 本脚本 -- <输出目录> [只重建的模型名...]

    不带模型名就全量重建。只改了一艘 Boss 时把名字列在后面,
    其它 glb 就不会被重新导出 —— 同样的输入两次导出的字节并不完全一致,
    全量跑一遍会让 git 里多出一堆无意义的二进制改动。
    """
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0] if argv else "public/neon-strike/models"
    wanted = argv[1:]
    unknown = [n for n in wanted if n not in BUILDERS]
    if unknown:
        raise SystemExit(f"未知模型名: {unknown};可选: {sorted(BUILDERS)}")
    os.makedirs(out_dir, exist_ok=True)
    for name, build in BUILDERS.items():
        if wanted and name not in wanted:
            continue
        build()
        export(os.path.join(out_dir, f"{name}.glb"))


main()
