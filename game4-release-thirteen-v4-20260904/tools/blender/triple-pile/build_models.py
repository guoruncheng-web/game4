"""
叠叠消 —— 12 个火锅食材的低模生成脚本(Blender 无头运行)。

输入是 `src/games/triple-pile/assets/source/*-chroma.png`:12 张品红抠像背景的正视图渲染。
输出是 `public/triple-pile/models/*.glb`,每个 glb 一个 mesh、贴图内嵌。

用法(在装了 Blender 的机器上,仓库根目录执行):
    blender -b --python tools/blender/triple-pile/build_models.py

可选参数:
    blender -b --python tools/blender/triple-pile/build_models.py -- <源图目录> <输出目录>

--------------------------------------------------------------------------------
这个脚本为什么能成立 —— 三条性质,缺一条整套方案就垮
--------------------------------------------------------------------------------

1. **12 张源图都是正视图**(正交感很强的渲染)。所以「把图沿 -Z 平面投影回模型」这一步
   等于把渲染反过来贴回去 —— 正面看过去和原图一模一样,不需要 UV 展开。

2. **模型的 XY 包围盒 == 贴图的不透明像素包围盒**,这是脚本强制保证的(见 build_mesh)。
   两者一旦对不上,超出图形轮廓的模型表面会因为采样到透明像素而**破洞**。
   所以尺寸不是手填的,是从图里量出来的。

3. **模型本地 +Z 就是「正面」**。槽位里陈列时物件正面朝相机(见 tray.ts 的归位旋转),
   于是玩家在槽位里看到的就是这张源图本身 —— 锅里认出来的东西和槽位里的完全对得上。

代价(已知且接受):平面投影会让垂直于 Z 的侧面出现拉伸条纹(texel smear)。
食材本身纹理杂乱,这层拉伸读起来就是「侧面」,在实际显示尺寸下看不出问题。

--------------------------------------------------------------------------------
形体分类
--------------------------------------------------------------------------------

全部保持**凸形**,这样运行时直接对模型顶点求凸包就是碰撞体,不需要另出一套 collider
(DESIGN.md 的硬性红线:所有 collider 必须是凸的)。

- `box`  立方体          —— 豆腐
- `disc` 沿 Z 的柱体      —— 玉米段、藕片(源图是横截面,盘面正对镜头)
- `blob` 椭球            —— 鱼丸、生菜、香菇、饺子、白菜
- `bar`  长条(自动定向)  —— 肥牛卷、蟹棒、香肠、腐竹卷
                            长轴方向不是手填的,是对 alpha 蒙版做 PCA 量出来的,
                            所以斜放的蟹棒也能自动对上。
"""

import math
import os
import sys
import tempfile

import bpy
import numpy as np


# ---------------------------------------------------------------- 配置

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DEFAULT_SRC = os.path.join(REPO_ROOT, "src", "games", "triple-pile", "assets", "source")
DEFAULT_OUT = os.path.join(REPO_ROOT, "public", "triple-pile", "models")
DEFAULT_SCENE_SRC = os.path.join(REPO_ROOT, "src", "games", "triple-pile", "assets", "scene")
DEFAULT_SCENE_OUT = os.path.join(REPO_ROOT, "public", "triple-pile", "scene")
DEFAULT_UI_SRC = os.path.join(REPO_ROOT, "src", "games", "triple-pile", "assets", "ui")
DEFAULT_UI_OUT = os.path.join(REPO_ROOT, "public", "triple-pile", "ui")

# UI 素材的输出尺寸。源图都是 1254~2098 的大图,而这些东西在屏幕上最大也就一两百像素,
# 按 2x DPR 留足余量即可
UI_SIZES = {
    "booster-match": 192,
    "booster-remove": 192,
    "button-back": 192,
    "button-pause": 192,
    "timer-panel": 420,
    "toast-panel": 420,
    "modal-panel": 900,
}
# modal-panel 存的是 RGB 黑底(没有 alpha 通道),只有四角是黑的。
# 木纹最暗约 0.095,背景 0.004,这个阈值能干净分开
MODAL_KEY_THRESHOLD = 0.03

# 背景桌面的输出宽度。它是一张铺满屏幕的底图,720 在 2x DPR 的手机上已经够用,
# 再大只是白白多下载几百 KB
TABLETOP_WIDTH = 720
# 槽位条的输出宽度。它横跨屏幕,但只有 356px 高,1024 足够
TRAY_WIDTH = 1024

# 品红抠像的判定阈值。源图是 JPEG 式压缩过的 PNG,边缘有噪点,所以留了宽容度
CHROMA = {"r_min": 0.42, "b_min": 0.42, "g_max": 0.42}
# 抠像后再往里收一圈,吃掉边缘的品红镶边
ALPHA_ERODE = 2
# 贴图长边上限。源图是 1254²,裁完还有 900 左右 —— 12 张原尺寸进 glb 会是 13MB,
# 而这些东西在屏幕上最大也就一百来像素,512 已经远超实际采样率
MAX_TEX = 512

# alpha 模式 —— **这一列决定模型的侧面会不会被 alphaTest 裁掉**,不是可有可无的开关:
#
#   "keep" 保留抠像轮廓,只把它向外扩几像素。适用于模型的正投影轮廓和源图轮廓基本一致的形体
#          (球、圆盘、长条)。外扩是为了救「最外一圈」—— 边缘那一圈面正好采样在轮廓边界上,
#          不扩就会被裁掉一条细边。
#
#   "patch" 只取图中心一小块平整区域,按模型的每个面各自平铺(不走整体平面投影)。
#          豆腐必须用这个:它的源图是立方体的**四分之三视角**,而模型是正对镜头的方盒。
#          走平面投影的话,盒子正面显示的是「一张画着立方体的图」,加上盒子自己的顶面,
#          等于把透视画了两遍,读起来是一块发白的板;而盒子的侧面会去采样六边形轮廓之外的
#          透明区,被 alphaTest 整片裁掉 —— 那正是「只看得到其中一面」。
#          豆腐是唯一表面完全均匀的食材,取一小块平铺反而最干净。
ITEMS = [
    # key,               形体,    最大边长(世界单位), 厚度系数, 段数, alpha
    ("tofu",             "box",   0.90, 1.00, 0,  "patch"),
    ("beef-roll",        "bar",   0.95, 1.00, 16, "keep"),
    ("crab-stick",       "bar",   1.15, 1.00, 16, "keep"),
    ("sausage",          "bar",   1.15, 1.00, 16, "keep"),
    ("tofu-skin-roll",   "bar",   1.10, 1.00, 16, "keep"),
    ("corn",             "disc",  0.92, 0.46, 20, "keep"),
    ("lotus-root",       "disc",  0.95, 0.28, 20, "keep"),
    ("shiitake",         "blob",  0.98, 0.70, 20, "keep"),
    ("fish-ball",        "blob",  0.84, 1.00, 20, "keep"),
    ("lettuce",          "blob",  0.96, 0.82, 20, "keep"),
    ("napa-cabbage",     "blob",  1.05, 0.62, 20, "keep"),
    ("dumpling",         "blob",  1.10, 0.42, 20, "keep"),
]
# "keep" 模式下 alpha 向外扩多少像素(在源图分辨率下量)
ALPHA_DILATE = 10


# ---------------------------------------------------------------- 抠像

def load_pixels(path):
    """读 PNG 成 (h, w, 4) 的 float 数组。Blender 的像素是从下往上排的,这里翻正。"""
    image = bpy.data.images.load(path)
    w, h = image.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(buf)
    bpy.data.images.remove(image)
    return buf.reshape(h, w, 4)[::-1].copy()


def key_chroma(rgba):
    """品红 → 透明,并做一次简单去镶边(despill)。返回同尺寸的 RGBA。"""
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    is_bg = (r > CHROMA["r_min"]) & (b > CHROMA["b_min"]) & (g < CHROMA["g_max"])
    alpha = np.where(is_bg, 0.0, 1.0).astype(np.float32)

    # 往里收一圈:边缘那几个像素混了背景色,留着会在模型轮廓上描一道品红边
    for _ in range(ALPHA_ERODE):
        shifted = np.ones_like(alpha)
        shifted[1:, :] = np.minimum(shifted[1:, :], alpha[:-1, :])
        shifted[:-1, :] = np.minimum(shifted[:-1, :], alpha[1:, :])
        shifted[:, 1:] = np.minimum(shifted[:, 1:], alpha[:, :-1])
        shifted[:, :-1] = np.minimum(shifted[:, :-1], alpha[:, 1:])
        alpha = np.minimum(alpha, shifted)

    # despill:食材本身极少出现「红蓝都明显高于绿」的像素,把这类像素的红蓝压到绿附近
    spill = (alpha > 0) & (r > g) & (b > g)
    out = rgba.copy()
    cap = np.maximum(g, (r + b) * 0.5 * 0.55)
    out[..., 0] = np.where(spill, np.minimum(r, cap), r)
    out[..., 2] = np.where(spill, np.minimum(b, cap), b)
    out[..., 3] = alpha
    return out


def bleed_edges(rgba, iterations=18):
    """把不透明区的颜色向外扩散若干圈(alpha 保持不变)。

    **这一步不是修饰,是必需的。** 平面投影下,垂直于 Z 的侧面(豆腐的顶面、圆柱的端盖)
    会把轮廓边缘那一排像素拉伸铺满整个面。边缘要是还留着抠像残下的品红,
    俯视时就是一道刺眼的粉色条纹 —— 这正是第一版渲染出来的样子。
    先把食材本身的颜色铺到轮廓外面,拉伸出来的就还是食物色。

    在裁剪之前做:此时图形四周还有大片背景,不会跨到对边去。
    """
    rgb = rgba[..., :3].copy()
    filled = rgba[..., 3] > 0
    for _ in range(iterations):
        if filled.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(filled.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(rgb, (dy, dx), axis=(0, 1)) * np.roll(filled, (dy, dx), axis=(0, 1))[..., None]
            cnt += np.roll(filled, (dy, dx), axis=(0, 1))
        newly = (~filled) & (cnt > 0)
        rgb[newly] = acc[newly] / cnt[newly][..., None]
        filled = filled | newly
    out = rgba.copy()
    out[..., :3] = rgb
    return out


def dilate_alpha(rgba, px):
    """把不透明区向外扩 px 像素。

    平面投影下,模型最外一圈的面正好采样在轮廓边界上,alpha 在那里已经掉到 0 附近,
    alphaTest 会把它们整片裁掉 —— 表现是圆盘少一圈边、球体轮廓发毛。
    向外扩一圈之后这些面就落在实心区里了。RGB 已经 bleed 过,扩出来的部分是食材本色。
    """
    alpha = rgba[..., 3].copy()
    for _ in range(px):
        grown = alpha.copy()
        grown[1:, :] = np.maximum(grown[1:, :], alpha[:-1, :])
        grown[:-1, :] = np.maximum(grown[:-1, :], alpha[1:, :])
        grown[:, 1:] = np.maximum(grown[:, 1:], alpha[:, :-1])
        grown[:, :-1] = np.maximum(grown[:, :-1], alpha[:, 1:])
        alpha = grown
    out = rgba.copy()
    out[..., 3] = alpha
    return out


def content_bbox(alpha):
    """不透明像素的外接框 (x0, y0, x1, y1),右下开区间。"""
    rows = np.where(alpha.any(axis=1))[0]
    cols = np.where(alpha.any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        raise RuntimeError("整张图都被判成背景了,检查 CHROMA 阈值")
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def save_png(rgba, path, max_size=MAX_TEX):
    h, w = rgba.shape[:2]
    image = bpy.data.images.new(os.path.basename(path), width=w, height=h, alpha=True)
    # 写回 Blender 时要再翻一次,回到「从下往上」
    image.pixels.foreach_set(rgba[::-1].ravel().astype(np.float32))
    # 降采样用 Blender 自带的 scale,省得自己写重采样
    if max(w, h) > max_size:
        k = max_size / max(w, h)
        image.scale(max(int(round(w * k)), 1), max(int(round(h * k)), 1))
    out_size = tuple(image.size)
    image.file_format = "PNG"
    image.filepath_raw = path
    image.save()
    bpy.data.images.remove(image)
    return out_size


def principal_axis(alpha):
    """对 alpha 蒙版做 PCA,返回(长轴角度, 沿长轴的长度, 垂直方向的宽度),单位是像素。

    斜放的蟹棒靠这个自动定向 —— 手填角度既容易填错,换一批图又得重填。
    """
    ys, xs = np.nonzero(alpha)
    pts = np.stack([xs.astype(np.float64), ys.astype(np.float64)], axis=1)
    pts -= pts.mean(axis=0)
    cov = np.cov(pts, rowvar=False)
    vals, vecs = np.linalg.eigh(cov)
    major = vecs[:, int(np.argmax(vals))]
    angle = math.atan2(major[1], major[0])
    proj_major = pts @ major
    minor = np.array([-major[1], major[0]])
    proj_minor = pts @ minor
    return angle, float(proj_major.max() - proj_major.min()), float(proj_minor.max() - proj_minor.min())


# ---------------------------------------------------------------- 建模

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_mesh(name, shape, half_x, half_y, half_z, segments, bar_angle=0.0, bar_half_len=0.0, bar_radius=0.0):
    """按形体建一个凸的低模,并把它精确塞进 (±half_x, ±half_y, ±half_z) 这个盒子。"""
    if shape == "box":
        bpy.ops.mesh.primitive_cube_add(size=2.0)
        obj = bpy.context.object
        obj.scale = (half_x, half_y, half_z)

    elif shape == "disc":
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=1.0, depth=2.0)
        obj = bpy.context.object
        # 柱轴默认沿 Z,正好是「盘面正对镜头」
        obj.scale = (half_x, half_y, half_z)

    elif shape == "blob":
        # 用 icosphere 而不是 UV 球:UV 球的极点正好落在正面中心(极轴 = Z = 正面方向),
        # 而极点处那一圈三角形的三个顶点里有两个重合,平面投影后 UV 退化成一个点 ——
        # 表现是物件正中央一个黑色风车状破面。icosphere 没有极点,三角也更均匀。
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
        obj = bpy.context.object
        obj.scale = (half_x, half_y, half_z)

    elif shape == "bar":
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=bar_radius, depth=bar_half_len * 2.0)
        obj = bpy.context.object
        # 柱轴从 Z 转到 X,再绕 Z 转到源图量出来的长轴方向
        obj.rotation_euler = (0.0, math.pi / 2, bar_angle)

    else:
        raise ValueError(f"未知形体 {shape}")

    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth() if shape != "box" else None
    return obj


def project_uv_box(obj):
    """按面的主法线做立方体贴图:每个面各自把自己的两个面内轴映射到 [0,1]。

    配合 "patch" 模式用 —— 贴图是一小块平整纹理,六个面各贴一份,
    不带任何来自源图的透视信息。
    """
    mesh = obj.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv_layer = mesh.uv_layers.new(name="UVMap")
    bounds = [
        (min(v.co[i] for v in mesh.vertices), max(v.co[i] for v in mesh.vertices))
        for i in range(3)
    ]
    spans = [max(hi - lo, 1e-6) for lo, hi in bounds]
    for poly in mesh.polygons:
        n = poly.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        u_axis, v_axis = [i for i in range(3) if i != axis]
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv_layer.data[loop_index].uv = (
                (co[u_axis] - bounds[u_axis][0]) / spans[u_axis],
                (co[v_axis] - bounds[v_axis][0]) / spans[v_axis],
            )


def project_uv(obj, min_x, min_y, size_x, size_y):
    """沿 -Z 的平面投影。因为模型 XY 包围盒 == 贴图不透明区包围盒,这一步是精确对齐的。"""
    mesh = obj.data
    # 关键:图元自带一层 UV(球面/柱面展开)。直接 new 会建成第二层,
    # 而材质和 glTF 导出器用的是第一层 —— 表现是贴图完全对不上、球面上出现破洞和锯齿环。
    # 所以必须先把自带的清掉。
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        co = mesh.vertices[loop.vertex_index].co
        uv_layer.data[loop.index].uv = (
            (co.x - min_x) / size_x,
            (co.y - min_y) / size_y,
        )


def make_material(name, texture_path):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(texture_path)
    tex.image.alpha_mode = "STRAIGHT"
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])

    # 背面剔除是必须的,不是优化:模型是闭合凸体,不开剔除的话背面会透过正面显出来
    # (Blender 5.x 的 EEVEE 已经没有 CLIP 混合模式,只能退回真半透明的 BLEND,
    #  而 BLEND 不做深度排序 —— 表现是球体正中央一片黑色破面)。
    # 运行时 Three 侧用 alphaTest + FrontSide,同样不走半透明排序。
    mat.use_backface_culling = True
    # Blender 4.2+ 把 alpha 裁剪从 blend_method 挪到了 surface_render_method:
    # DITHERED = 抖动裁剪(写深度),BLENDED = 真半透明(不写深度,会出条状伪影)。
    # 老版本没有这个属性,继续走下面的 blend_method。
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


# ---------------------------------------------------------------- 主流程

def build_item(key, shape, target_size, depth_ratio, segments, alpha_mode, src_dir, tex_dir):
    src = os.path.join(src_dir, f"{key}-chroma.png")
    if not os.path.exists(src):
        raise FileNotFoundError(src)

    keyed = key_chroma(load_pixels(src))
    # 裁剪框按**原始**轮廓算,免得扩过的 alpha 把模型尺寸也一起撑大
    x0, y0, x1, y1 = content_bbox(keyed[..., 3])
    # fill 模式要把整个裁剪框铺满食材色,所以 bleed 要一直跑到填满为止
    rgba = dilate_alpha(bleed_edges(keyed, iterations=18), ALPHA_DILATE)
    if alpha_mode == "patch":
        # 取块位置往下偏一点:四分之三视角下,轮廓框的正中心正好压在
        # 顶面和正面的那条交界线上,取到的块会带一道斜缝,而且六个面会各重复一次。
        # 下移之后落在纯正面里,是整张图最平整的一片
        cx = (x0 + x1) // 2
        cy = int((y0 + y1) / 2 + (y1 - y0) * 0.18)
        half = int(min(x1 - x0, y1 - y0) * 0.16)
        cropped = rgba[cy - half:cy + half, cx - half:cx + half].copy()
        cropped[..., 3] = 1.0
    else:
        cropped = rgba[y0:y1, x0:x1].copy()
    px_w, px_h = x1 - x0, y1 - y0

    tex_path = os.path.join(tex_dir, f"{key}.png")
    tex_size = save_png(cropped, tex_path)

    # 世界尺寸:长边取 target_size,短边按图的宽高比推出来 —— 这样轮廓才对得上
    px_w, px_h = x1 - x0, y1 - y0  # 尺寸永远按原始轮廓框推,和贴图裁法无关
    if px_w >= px_h:
        size_x = target_size
        size_y = target_size * px_h / px_w
    else:
        size_y = target_size
        size_x = target_size * px_w / px_h
    half_x, half_y = size_x / 2.0, size_y / 2.0
    half_z = min(half_x, half_y) * depth_ratio

    bar_angle = bar_half_len = bar_radius = 0.0
    if shape == "bar":
        angle, major_px, minor_px = principal_axis(cropped[..., 3])
        # 像素 → 世界的换算比例(x/y 同比例,因为上面是等比缩放的)
        scale = size_x / px_w
        bar_angle = -angle  # 图像 y 轴向下,世界 y 轴向上,角度要取反
        bar_half_len = major_px * scale / 2.0
        bar_radius = minor_px * scale / 2.0
        half_z = bar_radius

    obj = build_mesh(key, shape, half_x, half_y, half_z, segments, bar_angle, bar_half_len, bar_radius)
    if alpha_mode == "patch":
        project_uv_box(obj)
    else:
        project_uv(obj, -half_x, -half_y, size_x, size_y)
    obj.data.materials.append(make_material(key, tex_path))

    tris = sum(max(len(p.vertices) - 2, 0) for p in obj.data.polygons)
    return obj, dict(key=key, shape=shape, tris=tris,
                     size=(round(size_x, 3), round(size_y, 3), round(half_z * 2, 3)),
                     tex=tex_size)


def orient_for_gltf(obj):
    """把「正面」从 Blender 的 +Z 转到 -Y,这样导出成 Y-up 的 glTF 之后正面就是 Three 里的 +Z。

    建模和 UV 投影都在 XY 平面上做(正面朝 +Z),因为那样最直观 ——
    但 Blender 是 Z-up 而 glTF 是 Y-up,直接导出会让物件在 Three 里「脸朝天」。
    绕 X 转 -90°:Blender +Z(正面) → -Y,+Y(图的上方) → +Z,导出后正好是 Three 的 +Z / +Y。
    """
    obj.rotation_euler = (-math.pi / 2, 0.0, 0.0)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def export(obj, out_dir):
    orient_for_gltf(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, f"{obj.name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    return path


# ---------------------------------------------------------------- 场景素材

def build_scene(scene_src, source_dir, scene_out):
    """处理两张场景图:铺满屏幕的桌面底图,和底部的 7 格槽位条。

    槽位条和食材走同一套抠像 + bleed 流程(它也是品红背景);
    桌面本来就没有背景要抠,只需要缩一下、转成 JPEG —— 它没有透明区,
    存 PNG 会白白多出一兆多。
    """
    os.makedirs(scene_out, exist_ok=True)
    report = []

    tray_src = os.path.join(source_dir, "slot-tray-chroma.png")
    if os.path.exists(tray_src):
        rgba = bleed_edges(key_chroma(load_pixels(tray_src)))
        x0, y0, x1, y1 = content_bbox(rgba[..., 3])
        size = save_png(rgba[y0:y1, x0:x1], os.path.join(scene_out, "tray.png"), TRAY_WIDTH)
        # 宽高比要和游戏里的 TRAY.aspect 对上,对不上槽位会被拉变形
        report.append(f"tray.png {size[0]}×{size[1]} 宽高比 {size[0] / size[1]:.3f}")

    table_src = os.path.join(scene_src, "tabletop.png")
    if os.path.exists(table_src):
        rgba = load_pixels(table_src)
        size = save_jpeg(rgba, os.path.join(scene_out, "tabletop.jpg"), TABLETOP_WIDTH)
        report.append(f"tabletop.jpg {size[0]}×{size[1]}")

    return report


def build_ui(ui_src, ui_out):
    """UI 素材:统一降采样;modal-panel 另外要把黑底抠掉。"""
    if not os.path.isdir(ui_src):
        return []
    os.makedirs(ui_out, exist_ok=True)
    report = []
    for name, width in UI_SIZES.items():
        src = os.path.join(ui_src, f"{name}.png")
        if not os.path.exists(src):
            report.append(f"{name} 缺失,跳过")
            continue
        rgba = load_pixels(src)
        if name == "modal-panel":
            # 这张是 RGB 存的,alpha 全 1,四角的黑要按亮度抠掉
            lum = rgba[..., :3].mean(axis=2)
            rgba = rgba.copy()
            rgba[..., 3] = (lum >= MODAL_KEY_THRESHOLD).astype(np.float32)
            rgba = bleed_edges(rgba, iterations=6)
        # 裁掉四周的透明留白。面板要用 CSS 的 border-image 九宫格拉伸,
        # 留白会让切片值没法算准 —— 裁紧之后「切片 = 圆角半径」就是个确定的数
        x0, y0, x1, y1 = content_bbox(rgba[..., 3])
        size = save_png(rgba[y0:y1, x0:x1], os.path.join(ui_out, f"{name}.png"), width)
        report.append(f"{name} {size[0]}×{size[1]}")
    return report


def save_jpeg(rgba, path, max_width):
    h, w = rgba.shape[:2]
    image = bpy.data.images.new(os.path.basename(path), width=w, height=h, alpha=False)
    image.pixels.foreach_set(rgba[::-1].ravel().astype(np.float32))
    if w > max_width:
        k = max_width / w
        image.scale(max_width, max(int(round(h * k)), 1))
    out_size = tuple(image.size)
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    try:
        image.save_render(path, scene=scene)
    except (AttributeError, TypeError, RuntimeError):
        # 老版本 API 不吃 save_render,退回 PNG(体积大一些,但不会跑不起来)
        image.file_format = "PNG"
        image.filepath_raw = os.path.splitext(path)[0] + ".png"
        image.save()
    bpy.data.images.remove(image)
    return out_size


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    src_dir = argv[0] if len(argv) > 0 else DEFAULT_SRC
    out_dir = argv[1] if len(argv) > 1 else DEFAULT_OUT
    os.makedirs(out_dir, exist_ok=True)
    tex_dir = tempfile.mkdtemp(prefix="triple-pile-tex-")

    print(f"[triple-pile] 源图: {src_dir}")
    print(f"[triple-pile] 输出: {out_dir}")

    report = []
    for key, shape, size, depth, segments, alpha_mode in ITEMS:
        clear_scene()
        obj, info = build_item(key, shape, size, depth, segments, alpha_mode, src_dir, tex_dir)
        export(obj, out_dir)
        report.append(info)
        print(f"  ✓ {key:16s} {shape:5s} 三角 {info['tris']:4d}  "
              f"尺寸 {info['size']}  贴图 {info['tex'][0]}×{info['tex'][1]}")

    clear_scene()
    for line in build_scene(DEFAULT_SCENE_SRC, src_dir, DEFAULT_SCENE_OUT):
        print(f"  ✓ 场景 {line}")
    for line in build_ui(DEFAULT_UI_SRC, DEFAULT_UI_OUT):
        print(f"  ✓ UI  {line}")

    total = sum(r["tris"] for r in report)
    print(f"\n[triple-pile] 共 {len(report)} 个模型,合计 {total} 三角,"
          f"满场 120 个约 {total // len(report) * 120} 三角/帧")
    print("[triple-pile] 完成。glb 已内嵌贴图,可直接进仓库。")


if __name__ == "__main__":
    main()
