"""深海捕鱼的 8 条鱼:低模 + 骨架 + 游动循环 → public/fish-hunter/models/*.glb

    blender -b --python tools/blender/fish-hunter/build_models.py -- <源图目录> <输出目录>

设计取舍写在前面,改脚本之前先读:

**为什么不重新建模,而是拿现成的 2D 图当贴图。**
八张鱼图已经出好了(ART.md §2),质量也好。凭空建 8 条带鳞片和鳍的鱼、还要贴出同样的
质感,是几天的活;而这个游戏的相机是正对水面的正交相机,鱼始终以侧面朝向镜头 ——
**看不到的那些细节建了也是白建。** 所以沿用 triple-pile 那套「低模 + 平面投影 UV」,
只是这次多了骨架和动画。这样 3D 化拿到的是**动作**,而不是重新做一遍美术。

**形体:透镜状的双片壳,不是一张纸。**
一个平面在正交相机下看不出 3D,但一旦鱼转向、或者以后想给相机加一点俯角,纸片会立刻穿帮。
这里给每条鱼一个椭球截面的厚度(横截面沿身高和身长两个方向都收窄),正反两片壳在轮廓处缝合,
既有体积又只有 1~2k 面。

**坐标系:模型建在 Blender 的 XZ 平面上。**
glTF 导出器会把 Blender 的 Z-up 转成 Y-up,映射是 (X, Y, Z) → (X, Z, -Y)。
所以建在 XZ 平面(Y 当厚度)的模型,导出后正好落在 glTF 的 XY 平面上、厚度沿 Z ——
也就是"正对屏幕的一条鱼"。建在 XY 平面的话导出后会变成平躺在地上,相机只能看见鱼背。
这是 triple-pile 的 ART.md §0 里记过的那个坑,换个形体照样会踩。

**摆尾是在屏幕平面内弯。**
真鱼从侧面看,尾巴的摆动方向是朝向/背离观察者的,几乎看不见。游戏里一律做成屏幕平面内
上下摆 —— 不解剖学正确,但读起来才像在游。骨骼绕 Blender 的 Y 轴转就是这个平面内的弯曲。
"""

import math
import os
import sys

import bpy

# ---------------------------------------------------------------- 配置

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC_DIR = ARGV[0] if ARGV else "public/fish-hunter/fish"
OUT_DIR = ARGV[1] if len(ARGV) > 1 else "public/fish-hunter/models"

# 贴图长边上限。高 DPR 手机上 260 CSS px 的 Boss 实际会占到 780 个物理像素，
# 512 会明显发糊；1024 在清晰度、下载体积和显存之间更合适。
MAX_TEX = 1024

# 网格密度。沿身长要足够密,不然骨骼一弯就折成几段直线
GRID_U = 48
GRID_V = 20

# 两秒一个循环并增加采样密度。较长周期能容纳二次谐波，避免尾巴每秒机械重复一次。
FRAMES = 48

# 每条鱼一套自己的动作配方。
#
# **不要把八条鱼做成同一个摆尾、只改振幅。** 一条海龟和一条金龙用同一种动法,
# 玩家一眼就看出是同一个模板刷出来的 —— 而这游戏靠"一眼认出是哪种鱼"来做决策(ART.md §0),
# 动作是轮廓之外的第二条识别线索。所以每种鱼的动作由四个通道组合出来:
#
#   wave    脊椎行波:沿身长传递的弯曲。鳗形/纺锤形游泳的鱼靠它推进
#   bob     整体上下浮沉。慢速、有浮力的东西(龟、河豚、章鱼)靠它
#   rock    俯仰摇摆。划水前进的东西(龟)会一顿一顿地点头
#   breathe 呼吸缩放:身高/身长的周期性伸缩。鼓胀(河豚)、扇动(蝠鲼)、脉动(章鱼)
#
# 每个通道各有自己的频率倍率,**刻意取不整除的比值**(1.0 / 0.5 / 0.37 之类),
# 这样几个通道叠起来不会在同一拍上对齐,循环感被打散,看着才不像机器人。
#
# 字段:
#   thickness 厚度占身高的比例
#   bones     骨骼段数,沿身长从头到尾
#   swing     尾端最大摆幅(度);0 = 完全不弯
#   lag       波沿身体传递的相位滞后(弧度/整条身体)。大 = 更"蛇"
#   head_hold 头部不参与摆动的比例
#   bob       (幅度占身高比, 频率倍率)
#   rock      (俯仰角度, 频率倍率)
#   breathe   (身高缩放幅度, 身长缩放幅度, 频率倍率)
FISH = {
    # 小丑鱼:短身子高频摆,活泼。典型的鲹科摆尾
    "clown":  dict(thickness=0.34, bones=5,  swing=14, lag=1.9, head_hold=0.30,
                   bob=(0.02, 0.5), rock=(3, 0.37), breathe=(0.0, 0.0, 0)),
    # 蓝鳍鱼:纺锤形快鱼,波更长更顺,几乎不浮沉
    "blue":   dict(thickness=0.30, bones=5,  swing=16, lag=2.3, head_hold=0.26,
                   bob=(0.012, 0.5), rock=(2, 0.31), breathe=(0.0, 0.0, 0)),
    # 河豚:一个球,不弯。动作全在"鼓起-泄气"和缓慢浮沉上 ——
    # 让它摆尾会立刻不像河豚
    "puffer": dict(thickness=0.62, bones=3,  swing=3,  lag=0.8, head_hold=0.55,
                   bob=(0.05, 0.33), rock=(5, 0.21), breathe=(0.07, 0.05, 0.29)),
    # 海龟:硬壳绝不能弯。靠划水前进 —— 表现为一顿一顿的俯仰 + 明显浮沉,
    # 身体本身只有极轻微的跟随
    "turtle": dict(thickness=0.44, bones=3,  swing=4,  lag=0.6, head_hold=0.60,
                   bob=(0.045, 0.4), rock=(9, 0.4), breathe=(0.02, 0.0, 0.4)),
    # 蝠鲼:扇动胸鳍前进。从侧面看,扇动读出来是身高的周期性伸缩,
    # 而不是摆尾 —— 尾巴只是跟着甩
    "ray":    dict(thickness=0.22, bones=6,  swing=9,  lag=2.6, head_hold=0.40,
                   bob=(0.03, 0.5), rock=(4, 0.5), breathe=(0.13, 0.0, 0.5)),
    # 鲨鱼:大摆幅、低频率,沉稳有力。和小丑鱼的高频小摆正好相反
    "shark":  dict(thickness=0.26, bones=7,  swing=18, lag=2.0, head_hold=0.34,
                   bob=(0.015, 0.33), rock=(3, 0.27), breathe=(0.0, 0.0, 0)),
    # 金龙:蛇形,波数最多、摆幅最大,还带一点上下游弋 —— 它是大奖,就该最显眼
    "dragon": dict(thickness=0.18, bones=12, swing=24, lag=5.0, head_hold=0.14,
                   bob=(0.035, 0.29), rock=(6, 0.5), breathe=(0.0, 0.0, 0)),
    # 章鱼王:头是硬的,触手在飘。低频大幅的整体脉动 + 缓慢浮沉,
    # 慢而重 —— Boss 不该显得轻巧
    "boss":   dict(thickness=0.50, bones=6,  swing=11, lag=3.2, head_hold=0.52,
                   bob=(0.03, 0.23), rock=(3, 0.17), breathe=(0.09, 0.06, 0.23)),
}


# ---------------------------------------------------------------- 工具

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                  bpy.data.armatures, bpy.data.actions, bpy.data.objects):
        for item in list(block):
            try:
                block.remove(item)
            except (RuntimeError, ReferenceError):
                pass


def prepare_texture(src_path, work_dir, name):
    """缩到 MAX_TEX 以内并落一份临时 PNG。

    直接把加载后的 image 缩放是不够的:glTF 导出器对"有文件路径的图"会回去读原文件,
    内存里的缩放结果不算数。所以缩完必须存成新文件再重新加载。
    """
    img = bpy.data.images.load(src_path)
    w, h = img.size
    scale = min(1.0, MAX_TEX / max(w, h))
    out = os.path.join(work_dir, f"{name}-tex.png")
    if scale < 1.0:
        img.scale(max(1, int(round(w * scale))), max(1, int(round(h * scale))))
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return out, w / h


def build_shell(name, aspect, thickness):
    """透镜状双片壳。身高归一到 1.0,身长 = 1.0 × 贴图宽高比。

    UV 直接用网格参数 (u, v) —— 模型的包围盒就是贴图的边界,平面投影天然精确对齐,
    不需要像 triple-pile 那样再算一次不透明区包围盒(那批源图四周有留白,这批是紧裁过的)。
    """
    length = aspect
    half_t = thickness * 0.5

    verts, faces, uvs = [], [], []

    def sheet(sign):
        base = len(verts)
        for j in range(GRID_V):
            v = j / (GRID_V - 1)
            for i in range(GRID_U):
                u = i / (GRID_U - 1)
                # 椭球截面:沿身长和身高两个方向都收窄,四周自然收到 0,和轮廓缝合
                bulge = math.sqrt(max(0.0, 1.0 - (2 * u - 1) ** 2)) * \
                        math.sqrt(max(0.0, 1.0 - (2 * v - 1) ** 2))
                verts.append(((u - 0.5) * length, sign * half_t * bulge, v - 0.5))
                uvs.append((u, v))
        for j in range(GRID_V - 1):
            for i in range(GRID_U - 1):
                a = base + j * GRID_U + i
                b = a + 1
                c = a + GRID_U + 1
                d = a + GRID_U
                # 背面那片要反绕,否则背面剔除会把它剔掉,鱼看着只有一半
                faces.append((a, b, c, d) if sign < 0 else (a, d, c, b))

    sheet(-1)   # 正面(朝相机)
    sheet(+1)   # 背面

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    # UV。图元自带 UV 层的坑在 triple-pile 里踩过,这里是 from_pydata 建的,没有自带层,
    # 但保险起见还是先清一遍
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj, length


def make_material(name, texture_path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.5
    bsdf.inputs["Metallic"].default_value = 0.0

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(texture_path)
    tex.image.alpha_mode = "STRAIGHT"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])

    # 双片壳是闭合体,必须开背面剔除,否则背面会透过正面显出来
    mat.use_backface_culling = True
    try:
        mat.surface_render_method = "DITHERED"
    except (AttributeError, TypeError):
        pass
    for attempt in ("CLIP", "BLEND"):
        try:
            mat.blend_method = attempt
            break
        except (AttributeError, TypeError):
            continue
    try:
        mat.alpha_threshold = 0.5
    except (AttributeError, TypeError):
        pass
    return mat


def build_armature(name, length, count):
    """沿身长的一串骨头,从头(+X)排到尾(-X),依次父子相连。

    方向很重要:贴图一律朝右画(ART.md §1),所以 +X 是头。链条从头往尾长,
    尾巴才会跟着头走 —— 反过来的话,摆尾会把整条鱼的头甩出去。
    """
    arm_data = bpy.data.armatures.new(f"{name}-arm")
    arm = bpy.data.objects.new(f"{name}-arm", arm_data)
    bpy.context.collection.objects.link(arm)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")

    step = length / count
    parent = None
    names = []
    for i in range(count):
        bone = arm_data.edit_bones.new(f"seg{i}")
        # 从 +X(头)往 -X(尾)推进
        bone.head = (length * 0.5 - i * step, 0.0, 0.0)
        bone.tail = (length * 0.5 - (i + 1) * step, 0.0, 0.0)
        if parent is not None:
            bone.parent = parent
            bone.use_connect = True
        parent = bone
        names.append(bone.name)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm, names, step


def skin(obj, arm, bone_names, length, step):
    """按 x 坐标刷权重,相邻两根骨头之间线性过渡。

    不用自动权重(bpy.ops.object.parent_set ARMATURE_AUTO):它依赖骨骼包络的几何求解,
    在这种薄壳上很容易把正反两片的权重刷得不一样,弯起来两片会分开 —— 表现是鱼身裂开一条缝。
    按 x 手刷是完全可预测的,而且正反面必然一致。
    """
    groups = [obj.vertex_groups.new(name=n) for n in bone_names]
    head_x = length * 0.5

    for vert in obj.data.vertices:
        # t = 从头部起算的骨骼坐标(单位:骨节)
        t = (head_x - vert.co.x) / step
        i = int(math.floor(t))
        frac = t - i
        i = max(0, min(len(groups) - 1, i))
        j = max(0, min(len(groups) - 1, i + 1))
        if i == j:
            groups[i].add([vert.index], 1.0, "REPLACE")
        else:
            groups[i].add([vert.index], 1.0 - frac, "REPLACE")
            groups[j].add([vert.index], frac, "REPLACE")

    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True


def action_fcurves(action):
    """取一个 Action 的所有 F-Curve。

    Blender 4.4 起 Action 改成了分层结构(layer → strip → channelbag),
    老的 `action.fcurves` 在 5.x 上已经彻底没有了。两条路都留着:
    这个脚本要能在装着不同版本 Blender 的机器上跑,而报错信息
    (`'Action' object has no attribute 'fcurves'`)完全看不出是版本问题。
    """
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                out.extend(bag.fcurves)
    return out


def animate(arm, bone_names, spec):
    """给骨骼打一个循环的行波。

    每根骨头绕 **Y 轴** 转 —— 模型建在 XZ 平面上,绕 Y 转就是在这个平面内弯曲,
    也就是屏幕上看到的上下摆尾。

    首尾帧必须完全相同,否则循环时会有一下抽搐。这里用 f/FRAMES 做相位、
    最后再补一帧 FRAMES(相位正好走完 2π),天然闭合。
    """
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")

    count = len(bone_names)
    swing = math.radians(spec["swing"])
    lag = spec["lag"]
    hold = spec["head_hold"]

    scene = bpy.context.scene
    scene.frame_start = 0
    scene.frame_end = FRAMES

    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"

    bob_amp, bob_freq = spec["bob"]
    rock_amp, rock_freq = spec["rock"]
    breathe_z, breathe_x, breathe_freq = spec["breathe"]
    rock_amp = math.radians(rock_amp)

    root = arm.pose.bones[bone_names[0]]

    for f in range(FRAMES + 1):
        phase = 2 * math.pi * f / FRAMES
        scene.frame_set(f)

        for i, bname in enumerate(bone_names):
            k = i / max(1, count - 1)
            # 头部按 head_hold 的比例几乎不动,振幅从那里开始往尾部放大
            reach = max(0.0, (k - hold) / max(1e-3, 1.0 - hold))
            amp = swing * (reach ** 1.5)
            pb = arm.pose.bones[bname]
            # 主行波叠一层幅度较小、相位更迟的二次波：尾端会有自然的回弹，
            # 不再像整张鱼卡片沿一条正弦曲线来回折。
            primary = math.sin(phase - k * lag)
            secondary = math.sin(phase * 2.0 - k * lag * 1.55 + 0.7) * 0.22
            tail_flick = math.sin(phase * 3.0 - k * lag * 1.9) * 0.08 * (reach ** 2)
            bend = (primary + secondary + tail_flick) * amp
            # 俯仰只打在根骨上,整条鱼一起点头
            pitch = math.sin(phase * rock_freq) * rock_amp if i == 0 else 0.0
            pb.rotation_euler = (0.0, bend + pitch, 0.0)
            pb.keyframe_insert(data_path="rotation_euler", frame=f)

        # 浮沉与呼吸缩放都打在根骨上。
        # **注意骨骼的局部轴**:骨头沿 X 排列,所以它的 Y 轴才是"骨头的长度方向",
        # 上下浮沉对应的是局部 Z。这个轴搞错的表现是鱼在前后抽搐而不是上下浮。
        if bob_amp:
            root.location = (0.0, 0.0, math.sin(phase * bob_freq) * bob_amp)
            root.keyframe_insert(data_path="location", frame=f)
        if breathe_z or breathe_x:
            pulse = math.sin(phase * breathe_freq)
            root.scale = (1.0 + pulse * breathe_x, 1.0, 1.0 + pulse * breathe_z)
            root.keyframe_insert(data_path="scale", frame=f)

    # 线性插值:关键帧本来就是采样自正弦曲线,再让 Blender 加一层贝塞尔缓动
    # 会把波形压扁,摆动看着像卡顿
    action = arm.animation_data.action
    for fcurve in action_fcurves(action):
        for kp in fcurve.keyframe_points:
            kp.interpolation = "LINEAR"

    bpy.ops.object.mode_set(mode="OBJECT")
    action.name = "swim"
    action.use_fake_user = True


def export(arm, obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_skins=True,
        export_apply=False,
    )


# ---------------------------------------------------------------- 主流程

def main():
    src_dir = os.path.abspath(SRC_DIR)
    out_dir = os.path.abspath(OUT_DIR)
    work_dir = os.path.join(out_dir, ".work")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)

    built = []
    for kind, spec in FISH.items():
        src = os.path.join(src_dir, f"{kind}.png")
        if not os.path.exists(src):
            print(f"[skip] 缺源图 {src}")
            continue

        clear_scene()
        tex_path, aspect = prepare_texture(src, work_dir, kind)
        obj, length = build_shell(kind, aspect, spec["thickness"])
        obj.data.materials.append(make_material(f"{kind}-mat", tex_path))
        arm, bone_names, step = build_armature(kind, length, spec["bones"])
        skin(obj, arm, bone_names, length, step)
        animate(arm, bone_names, spec)

        out = os.path.join(out_dir, f"{kind}.glb")
        export(arm, obj, out)
        size = os.path.getsize(out) / 1024
        built.append(f"{kind}.glb  {size:.0f}KB  长宽比 {aspect:.2f}  {spec['bones']} 骨  摆幅 {spec['swing']}°")
        print(f"[ok] {built[-1]}")

    print("\n".join(["", "产出:"] + built))


main()
