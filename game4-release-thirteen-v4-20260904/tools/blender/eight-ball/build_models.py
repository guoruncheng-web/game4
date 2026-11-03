"""
Eight Ball —— 台体 / 球杆的 3D 模型生成脚本(Blender 无头运行)。

用法(在装了 Blender 的机器上):
    blender -b --python tools/blender/eight-ball/build_models.py -- public/eight-ball/models
    blender -b --python tools/blender/eight-ball/build_models.py -- public/eight-ball/models cue

不带模型名就全量重建;只改了球杆时把名字列在后面,免得另一个 glb 也被重导
—— 同样的输入两次导出的字节并不完全一致,全量跑一遍会让 git 里多出无意义的二进制改动。

================================ 尺寸必须和物理对齐 ================================

physics.ts 认的是 config.ts 里那套 2D 逻辑像素:PLAY 矩形、POCKETS 六个圆心、
BALL_R、POCKET_R。这个脚本里的常量是从同一套数字换算来的,**改了必须两边同步**,
否则视觉上会出现"球穿进库边里"或者"离袋口还有一截就凭空消失"。

守住两条,对不齐也不会伤到判定:
1. **台呢平面不在这个模型里**,由代码用 PlaneGeometry 画。
   「球能跑的区域」永远由代码定义,模型只负责库边以外的部分。
2. **库边内壁是垂直的**,正好落在 PLAY 边界上 —— 和物理的反弹判定完全一致。
   真台的库边截面是斜的(接触点在球心高度),这里刻意不做:斜面好看一点点,
   但只要角度和物理对不上,球就会看起来"陷进库里再弹出来"。

================================ 坐标约定 ================================

Blender 是 Z-up,导出走 export_yup=True 转成 glTF 的 Y-up,换算关系是
    glTF(x, y, z) = Blender(x, z, -y)
所以在这个脚本里:
    2D 的 x  →  Blender +X   (导出后是 Three 的 +X)
    2D 的 y  →  Blender -Y   (导出后是 Three 的 +Z)
    高度      →  Blender +Z   (导出后是 Three 的 +Y)

原点放在**台面中心、台呢表面**上。也就是说台呢在 z = 0,台腿往 z 负方向长。
引擎侧把模型直接 add 到场景原点即可,不需要任何额外位移或旋转。

球杆:杆头(皮头尖端)在原点,杆身沿 Blender -Y 延伸 —— 导出后就是 Three 的 +Z。
代码里把它摆到母球上、绕 Y 轴转到瞄准角就行。
"""

import math
import os
import sys

import bpy
import mathutils


# ---------------------------------------------------------------- 与 config.ts 同步的常量

# --- 以下 6 个数字直接抄自 src/games/eight-ball/config.ts,改了必须同步 ---
PLAY_LEFT, PLAY_RIGHT = 96.0, 444.0
PLAY_TOP, PLAY_BOTTOM = 148.0, 844.0
RAIL = 26.0        # 木质库边厚度(只影响画面,不参与判定)
BALL_R = 8.6
POCKET_R = 15.5
# ------------------------------------------------------------------------

PLAY_W = PLAY_RIGHT - PLAY_LEFT      # 348
PLAY_H = PLAY_BOTTOM - PLAY_TOP      # 696
CENTER_X = (PLAY_LEFT + PLAY_RIGHT) / 2
CENTER_Y = (PLAY_TOP + PLAY_BOTTOM) / 2

# 世界单位取**米**:台面按真实九尺台的 1.27m × 2.54m 来,
# 这样环境贴图、灯光衰减、相机 FOV 都能按真实尺度调,不用凭空试参数。
WORLD_SCALE = 1.27 / PLAY_W          # ≈ 0.0036494 m/px

HALF_W = PLAY_W / 2 * WORLD_SCALE    # 0.635
HALF_H = PLAY_H / 2 * WORLD_SCALE    # 1.27
BALL_RADIUS = BALL_R * WORLD_SCALE   # ≈ 0.0314(真球 0.0286,config 里刻意放大了一点点)
RAIL_W = RAIL * WORLD_SCALE          # ≈ 0.0949
POCKET_RADIUS = POCKET_R * WORLD_SCALE  # ≈ 0.0566

# 袋口在模型上开的洞比判定半径大一圈,免得球看着还没碰到袋边就没了
POCKET_CUT = POCKET_RADIUS * 1.12
# 库边高度:真台的库皮顶面大约在 1.35 个球径处
CUSHION_H = BALL_RADIUS * 2 * 1.35   # ≈ 0.0847
# 边框(木框)顶面比库皮再高一点点,形成一圈台肩
FRAME_H = CUSHION_H * 1.12
FRAME_W = RAIL_W * 1.9               # 木框比库皮宽,球杆要架在上面
# 裙板 + 台腿:台呢面离地 0.75m 是标准球台高度
TABLE_HEIGHT = 0.75
APRON_H = 0.16

CUE_LENGTH = 1.47                    # 真实球杆 57~58 inch


def px(x2d, y2d):
    """config.ts 的 2D 逻辑像素 → Blender 的 (X, Y)。"""
    return ((x2d - CENTER_X) * WORLD_SCALE, -(y2d - CENTER_Y) * WORLD_SCALE)


POCKETS = [
    px(PLAY_LEFT, PLAY_TOP),
    px(PLAY_RIGHT, PLAY_TOP),
    px(PLAY_LEFT, CENTER_Y),
    px(PLAY_RIGHT, CENTER_Y),
    px(PLAY_LEFT, PLAY_BOTTOM),
    px(PLAY_RIGHT, PLAY_BOTTOM),
]


# ---------------------------------------------------------------- 基础工具

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(hex_color):
    """#RRGGBB → Blender 的线性色。Base Color 吃的是线性值,
    直接把 sRGB 的十六进制塞进去颜色会明显偏亮。"""
    h = hex_color.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def make_material(name, hex_color, *, metal=0.0, rough=0.55):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*srgb(hex_color), 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return mat


def finish(obj, name, material, shade_smooth=False):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if shade_smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def box(name, material, center, size):
    """center/size 都是 (x, y, z) 的世界值,size 是全长不是半长。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material)


def cylinder(name, material, center, radius, depth, *, verts=24, rot=(0, 0, 0), smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, location=center, rotation=rot,
    )
    return finish(bpy.context.object, name, material, shade_smooth=smooth)


def cone(name, material, center, r1, r2, depth, *, verts=24, rot=(0, 0, 0), smooth=True):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=r1, radius2=r2, depth=depth, location=center, rotation=rot,
    )
    return finish(bpy.context.object, name, material, shade_smooth=smooth)


def boolean(target, cutter, op='DIFFERENCE'):
    """布尔运算。袋口那六个豁口用它开,比手工建模少写一百行。"""
    mod = target.modifiers.new(name="bool", type='BOOLEAN')
    mod.object = cutter
    mod.operation = op
    # 求解器的枚举值各版本不一样:4.x 是 FAST/EXACT,5.x 换成了 FLOAT/EXACT/MANIFOLD。
    # 挑一个当前版本认识的,别写死 —— 写死了换台机器就跑不起来。
    solvers = {item.identifier for item in mod.bl_rna.properties['solver'].enum_items}
    for candidate in ('EXACT', 'MANIFOLD', 'FLOAT', 'FAST'):
        if candidate in solvers:
            mod.solver = candidate
            break
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return target


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


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
    # 把包围盒打出来:引擎侧要拿它和 config.ts 的 PLAY 对一遍,靠肉眼估必然对不上
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
    dims = tuple(round(hi[i] - lo[i], 4) for i in range(3))
    print(f"EXPORTED {path} tris={tris} size={os.path.getsize(path)} dims(x,y,z)={dims}")


# ---------------------------------------------------------------- 台体

def build_table():
    reset_scene()
    wood = make_material("RailWood", "#5A3320", rough=0.38)
    wood_lit = make_material("RailWoodLit", "#8A5233", rough=0.42)
    cushion_mat = make_material("Cushion", "#14563A", rough=0.85)
    dark = make_material("PocketDark", "#0A0D10", rough=0.9)

    parts = []

    # --- 库皮:一圈内壁垂直落在 PLAY 边界上的矮墙 ---
    outer = box("CushionRing", cushion_mat,
                (0, 0, CUSHION_H / 2),
                (2 * (HALF_W + RAIL_W), 2 * (HALF_H + RAIL_W), CUSHION_H))
    inner = box("CushionCut", cushion_mat,
                (0, 0, CUSHION_H / 2),
                (2 * HALF_W, 2 * HALF_H, CUSHION_H * 3))
    boolean(outer, inner)
    # 六个袋口:垂直圆柱直接穿透,开口比判定半径大 12%
    for i, (x, y) in enumerate(POCKETS):
        cut = cylinder(f"PocketCut{i}", cushion_mat, (x, y, CUSHION_H / 2),
                       POCKET_CUT, CUSHION_H * 4, verts=20)
        boolean(outer, cut)
    parts.append(outer)

    # --- 木框:库皮外面一圈更宽更高的台肩,球杆架在上面 ---
    frame = box("Frame", wood,
                (0, 0, FRAME_H / 2),
                (2 * (HALF_W + RAIL_W + FRAME_W), 2 * (HALF_H + RAIL_W + FRAME_W), FRAME_H))
    frame_cut = box("FrameCut", wood,
                    (0, 0, FRAME_H / 2),
                    (2 * (HALF_W + RAIL_W), 2 * (HALF_H + RAIL_W), FRAME_H * 3))
    boolean(frame, frame_cut)
    for i, (x, y) in enumerate(POCKETS):
        cut = cylinder(f"FramePocketCut{i}", wood, (x, y, FRAME_H / 2),
                       POCKET_CUT * 1.35, FRAME_H * 4, verts=20)
        boolean(frame, cut)
    parts.append(frame)

    # --- 裙板:木框往下垂的一圈板,把台体的厚度做出来 ---
    apron = box("Apron", wood_lit,
                (0, 0, -APRON_H / 2),
                (2 * (HALF_W + RAIL_W + FRAME_W), 2 * (HALF_H + RAIL_W + FRAME_W), APRON_H))
    apron_cut = box("ApronCut", wood_lit,
                    (0, 0, -APRON_H / 2),
                    (2 * (HALF_W + RAIL_W + FRAME_W * 0.35),
                     2 * (HALF_H + RAIL_W + FRAME_W * 0.35), APRON_H * 3))
    boolean(apron, apron_cut)
    parts.append(apron)

    # --- 网兜:六个袋口下面挂的兜。上宽下窄的锥壳,深色,只是让袋口不见底 ---
    for i, (x, y) in enumerate(POCKETS):
        net = cone(f"Net{i}", dark,
                   (x, y, -APRON_H - POCKET_CUT * 0.5),
                   POCKET_CUT * 1.05, POCKET_CUT * 0.35, POCKET_CUT * 1.6, verts=16)
        parts.append(net)

    # --- 台腿:四条,从裙板底一直落到地面 ---
    leg_inset = FRAME_W * 1.2
    leg_w = RAIL_W * 1.8
    leg_h = TABLE_HEIGHT - APRON_H
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = sx * (HALF_W + RAIL_W + FRAME_W - leg_inset)
            ly = sy * (HALF_H + RAIL_W + FRAME_W - leg_inset)
            parts.append(box(f"Leg{sx}{sy}", wood,
                             (lx, ly, -APRON_H - leg_h / 2),
                             (leg_w, leg_w, leg_h)))

    join(parts, "PoolTable")


# ---------------------------------------------------------------- 球杆

def build_cue():
    """杆头在原点,杆身沿 -Y 延伸(导出后是 Three 的 +Z)。"""
    reset_scene()
    tip_mat = make_material("CueTip", "#2E6FB7", rough=0.75)
    ferrule = make_material("CueFerrule", "#EDE6D6", rough=0.35)
    shaft_mat = make_material("CueShaft", "#D8B384", rough=0.32)
    joint_mat = make_material("CueJoint", "#C8A24A", metal=0.9, rough=0.25)
    butt_mat = make_material("CueButt", "#4A2418", rough=0.3)
    wrap_mat = make_material("CueWrap", "#1A1614", rough=0.85)

    r_tip, r_joint, r_butt = 0.0065, 0.0105, 0.0148
    parts = []
    cursor = 0.0  # 从杆头往 -Y 走过的长度

    def seg(name, material, length, r1, r2, *, smooth=True):
        nonlocal cursor
        # 圆柱默认沿 Z,绕 X 转 90° 之后沿 Y;再放到 -Y 侧
        obj = cone(name, material,
                   (0, -(cursor + length / 2), 0), r1, r2, length,
                   verts=16, rot=(math.pi / 2, 0, 0), smooth=smooth)
        cursor += length
        return obj

    # 圆锥的 radius1 在 -Z 端,绕 X 转 +90° 后 -Z 指向 +Y,也就是靠近杆头那一侧
    parts.append(seg("Tip", tip_mat, 0.012, r_tip * 0.96, r_tip))
    parts.append(seg("Ferrule", ferrule, 0.026, r_tip, r_tip * 1.04))
    parts.append(seg("Shaft", shaft_mat, 0.72, r_tip * 1.04, r_joint))
    parts.append(seg("Joint", joint_mat, 0.022, r_joint * 1.06, r_joint * 1.06))
    parts.append(seg("ButtUpper", butt_mat, 0.38, r_joint, r_butt * 0.92))
    parts.append(seg("Wrap", wrap_mat, 0.28, r_butt * 0.92, r_butt))
    parts.append(seg("Bumper", wrap_mat, CUE_LENGTH - cursor, r_butt, r_butt * 0.86))

    join(parts, "CueStick")


# ---------------------------------------------------------------- 入口

BUILDERS = {
    "table": build_table,
    "cue": build_cue,
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0] if argv else "public/eight-ball/models"
    wanted = argv[1:]
    unknown = [n for n in wanted if n not in BUILDERS]
    if unknown:
        raise SystemExit(f"未知模型名: {unknown};可选: {sorted(BUILDERS)}")
    os.makedirs(out_dir, exist_ok=True)
    print(f"WORLD_SCALE={WORLD_SCALE:.7f} m/px  play={2 * HALF_W:.3f}x{2 * HALF_H:.3f}m  "
          f"ball_r={BALL_RADIUS:.4f}m  pocket_r={POCKET_RADIUS:.4f}m")
    for name, build in BUILDERS.items():
        if wanted and name not in wanted:
            continue
        build()
        export(os.path.join(out_dir, f"{name}.glb"))


main()
