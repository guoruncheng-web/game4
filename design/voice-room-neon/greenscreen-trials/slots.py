"""方案 B 批量生产配置：32 个语义槽位 → 绿幕单体素材。

每条记录:
  ref   参考图（相对 voice-room-neon/）。用已切的 tile 作"样式参考"——这是那批 tile
        唯一合理的用途；概念稿缺失的槽位改用整屏概念图 + 文字描述。
  size  生成画布尺寸。按组件宽高比选，宁可画布大、组件居中留白，也不要贴边裁掉外发光。
  desc  组件描述。必须具体到形状/配色/描边层数/高光/发光，否则模型会自由发挥。
"""

GREEN = (
    "背景必须是完全均匀的纯绿色 #00FF00 色键背景，"
    "不要任何星点、云雾、渐变、噪点、阴影或倒影。"
    "组件水平垂直居中，四周必须留出充足空白，外发光和描边完整，绝对不能触碰或超出画面边缘。"
    "这是游戏 UI 素材切图，高清，边缘锐利干净，画面里只有这一个组件，不要出现任何其他元素。"
    "不要画任何文字、字母、数字或字符。"
)

CUT = "cutouts/"
MAIN = "main-room-candidates/main-room-starry-v3_84001.png"
MAIN2 = "main-room-candidates/main-room-starry-v3_84002.png"

SLOTS = {
    # ---------- A. 麦位区 ----------
    # 下面三个是 2026-09-11 的试样批次（seed 951xx/952xx/953xx），已通过验收，
    # 配置在此登记以便将来重跑；素材已并入 greenscreen-assets/。
    "seat.frame.occupied": dict(
        ref=CUT + "main-room/seat-frame-occupied-plain.png", size=(1024, 1024), seeds="95201,95202",
        desc="把 image1 中的这个圆形麦位头像框单独重新绘制出来。"
             "严格保持与 image1 完全一致的金色花丝雕花圆环、藤蔓与丝带缠绕细节、"
             "淡紫色丝绸质感、金属光泽和厚度。"
             "圆环中心必须是空的，不要画任何动物头像、人脸或图案，中心留空供运行时填入头像。",
    ),
    "seat.frame.empty": dict(
        ref=CUT + "main-room/seat-empty-frame.png", size=(1024, 1024), seeds="95301,95302",
        desc="把 image1 中的这个空麦位圆形按钮单独重新绘制出来。"
             "严格保持与 image1 完全一致的深紫色半透明圆形底、紫色发光圆环描边、"
             "以及圆心那个柔光发亮的白紫色麦克风图标。"
             "去掉下方的“点击上麦”文字胶囊和所有文字，只保留圆形底和麦克风图标。",
    ),
    "seat.frame.speaking-ring": dict(
        ref=CUT + "main-room/seat-frame-occupied-speaking.png", size=(1024, 1024), seeds="96101,96102",
        desc="把 image1 中套在麦位框外侧的那一圈金色说话光环单独画出来："
             "一个明亮的暖金色圆环光晕，内侧亮、向外柔和扩散衰减，像发光的光圈。"
             "只画这圈光环本身，不要画里面的头像框、藤蔓、丝带或头像，圆环中心必须完全空着。",
    ),
    "seat.accent.moon": dict(
        ref=CUT + "main-room/moon-crescent-accent.png", size=(768, 768), seeds="96201,96202",
        desc="把 image1 中那个小小的金色月牙挂饰单独放大画出来："
             "一枚立体的金色新月，表面有金属渐变和高光，月牙尖端细而圆润，整体带柔和暖金色辉光。",
    ),
    "seat.badge.corner": dict(
        ref=CUT + "main-room/seat-badge-corner.png", size=(768, 768), seeds="96301,96302",
        desc="把 image1 中麦位右上角那个小圆形徽章的【底座】单独画出来："
             "一个深紫色半透明圆形底，外圈一道细的亮紫色描边，表面有轻微玻璃质感高光。"
             "圆心必须完全空着，不要画里面的任何图标或动物头像。",
    ),
    "seat.badge.crown": dict(
        ref=MAIN2, size=(768, 768), seeds="96401,96402",
        desc="按 image1 的美术风格（星空游戏 UI、金色花丝、暖金光泽）画一枚房主皇冠徽章："
             "一顶小巧的立体金色皇冠，三个尖角，中间尖角略高，冠身有金属渐变和高光，"
             "底部一道横梁，镶一颗淡紫色宝石，整体带柔和暖金色辉光。正面视角，居中。",
    ),
    "seat.nametag": dict(
        ref=CUT + "main-room/name-lv-tag-row1.png", size=(1024, 512), seeds="96501,96502",
        desc="把 image1 中麦位下方那个名牌胶囊的【空白底板】单独画出来："
             "一个横向圆角胶囊，深紫色半透明底，外圈一道很细的淡金色描边，表面微弱玻璃高光。"
             "胶囊内部必须是干净的空白底面，不要任何文字。",
    ),
    "avatar.frame.ornate": dict(
        ref=CUT + "popup-member/avatar-photo-frame.png", size=(1024, 1024), seeds="96601,96602",
        desc="把 image1 中那个金色雕花圆形头像相框单独画出来："
             "一圈厚重的金色浮雕花边圆环，环上有对称的卷草纹和珠饰，金属渐变明显、高光强。"
             "圆环中心必须完全空着，不要画任何人脸、头像或图案。",
    ),

    # ---------- B. 通用控件 ----------
    "button.capsule.gold": dict(
        ref=CUT + "popup-confirm/button-primary-outline.png", size=(1024, 512), seeds="95101,95102",
        desc="把 image1 中的这个金色胶囊按钮单独重新绘制出来。"
             "严格保持与 image1 完全一致的胶囊圆角形状、宽高比例、金色渐变底面、"
             "双层金色描边、内侧高光和四周暖金色外发光。"
             "去掉按钮上的所有文字，按钮内部保持干净的金色渐变面，不要任何字符。",
    ),
    "button.capsule.red": dict(
        ref=CUT + "popup-confirm/button-destructive.png", size=(1024, 512), seeds="96701,96702",
        desc="把 image1 中的红色胶囊按钮单独画出来："
             "胶囊圆角形状，深红到亮红的渐变底面，外圈一道金色细描边，"
             "顶部有一条弧形白色高光，四周带柔和的红色外发光。按钮表面必须干净无文字。",
    ),
    "button.capsule.disabled": dict(
        ref=CUT + "popup-invite/invite-button-already.png", size=(1024, 512), seeds="96801,96802",
        desc="画一个【禁用态】的胶囊按钮："
             "形状与普通胶囊按钮相同，但整体明显变暗、饱和度降低，呈暗紫红色哑光表面，"
             "描边暗淡无光泽，没有外发光，看上去不可点击。按钮表面干净无文字。",
    ),
    "button.icon.round": dict(
        ref=CUT + "main-room/bottombar-icon-button-1.png", size=(768, 768), seeds="96901,96902",
        desc="把 image1 中底栏那个圆形图标按钮的【空白底座】单独画出来："
             "一个正圆形，深紫色半透明底，外圈一道细的淡金色描边环，表面微弱玻璃高光。"
             "圆心必须完全空着，不要画里面的任何图标。",
    ),
    "button.tile.neutral": dict(
        ref=CUT + "popup-member/icon-button-neutral.png", size=(1024, 768), seeds="97001,97002",
        desc="把 image1 中那个方形功能按钮的【空白底板】单独画出来："
             "一个圆角矩形，深紫色半透明底，外圈一道淡金色描边，四角有轻微发光，"
             "整体像一块发微光的玻璃面板。内部必须干净空白，不要任何图标或文字。",
    ),
    "button.tile.warning": dict(
        ref=CUT + "popup-member/icon-button-warning.png", size=(1024, 768), seeds="97101,97102",
        desc="画一个【警示态】的方形功能按钮底板："
             "圆角矩形，深紫色半透明底，但外圈描边是明亮的红色并带红色外发光，"
             "整体透出危险/警告的气氛。内部必须干净空白，不要任何图标或文字。",
    ),
    # 返工 1：首轮出图是蓝灰色扁条，偏蓝偏暗、无描边无高光、左端尖角过大像标签箭头。
    # 本轮强调 深紫 + 玻璃质感 + 细描边 + 顶部高光，并把尖角明确限制得很小。
    "row.bubble.bg": dict(
        ref=CUT + "main-room/chat-bubble-plain.png", size=(1280, 640), seeds="99201,99202",
        desc="画一个聊天气泡的【空白底板】，用于深紫色星空界面："
             "主体是一个横向的圆角矩形，圆角半径中等偏大但不是胶囊形；"
             "底面是【深紫色】半透明玻璃质感，能透出后面的紫色，不要蓝灰色、不要不透明纯色；"
             "外圈有一道很细的淡紫色描边；顶部有一道非常微弱的白色弧形高光，像玻璃反光。"
             "左侧边缘的中间位置有一个【很小的】三角形尖角朝左，像聊天气泡指向头像的小尾巴，"
             "这个尖角要明显小于气泡高度的三分之一，主体必须仍然是完整的圆角矩形。"
             "气泡内部必须是干净空白，不要任何文字、头像、图标或箭头。",
    ),
    "input.field": dict(
        ref=CUT + "main-room/bottombar-input-field.png", size=(1280, 512), seeds="97301,97302",
        desc="把 image1 中的输入框【空白底板】单独画出来："
             "一个横向长圆角胶囊，深紫色半透明底，外圈一道细的淡金色描边，"
             "内部干净、略暗，像可以输入文字的凹槽。不要任何文字、光标或图标。",
    ),
    "avatar.circle.plain": dict(
        ref=CUT + "popup-requests/avatar-circle-plain-ring.png", size=(768, 768), seeds="97401,97402",
        desc="把 image1 中那个简洁的圆形头像框【只保留外框】画出来："
             "一个正圆环，环体是一道均匀的淡金色细描边，带轻微金属光泽和很弱的外发光。"
             "圆环中心必须完全空着，不要画任何人脸、动物或图案。",
    ),

    # ---------- C. 胶囊与徽章 ----------
    "pill.status.gold": dict(
        ref=CUT + "popup-members-list/status-pill-gold.png", size=(768, 512), seeds="97501,97502",
        desc="把 image1 中那个金色小状态胶囊的【空白底板】画出来："
             "一个小而扁的圆角胶囊，金色渐变底面，外圈一道深金色细描边，顶部一条弧形高光。"
             "胶囊内部必须干净无文字。",
    ),
    "pill.status.red": dict(
        ref=CUT + "popup-members-list/status-pill-red.png", size=(768, 512), seeds="97601,97602",
        desc="把 image1 中那个红色小状态胶囊的【空白底板】画出来："
             "一个小而扁的圆角胶囊，深红到亮红渐变底面，外圈一道细描边，顶部一条弧形高光。"
             "胶囊内部必须干净无文字。",
    ),
    "pill.role.badge": dict(
        ref=CUT + "popup-member/badge-role-pill.png", size=(1024, 512), seeds="97701,97702",
        desc="把 image1 中那个身份徽章胶囊的【空白底板】画出来："
             "一个横向圆角胶囊，左端嵌着一枚金色圆形勋章（有齿边和高光），"
             "胶囊主体是淡青色到白色的渐变底面，外圈一道金色细描边。"
             "胶囊主体内部必须干净无文字。",
    ),
    "pill.count.small": dict(
        ref=CUT + "popup-manage/notif-count-pill.png", size=(512, 512), seeds="97801,97802",
        desc="画一个很小的计数气泡底板："
             "一个小圆角胶囊，淡紫灰色半透明底，外圈一道极细的浅色描边，表面轻微高光。"
             "内部必须干净空白，不要任何数字或文字。",
    ),
    "badge.lv": dict(
        ref=CUT + "popup-requests/lv-badge-pill.png", size=(512, 512), seeds="97901,97902",
        desc="画一枚金色等级徽章的【空白底板】："
             "一个小的金色圆角菱形/盾形牌，金属渐变明显，边缘一道深金色描边，表面有高光。"
             "牌面中央必须干净空白，不要任何字母或数字。",
    ),
    "badge.heart": dict(
        ref=CUT + "popup-members-list/badge-icon-heart.png", size=(512, 512), seeds="98001,98002",
        desc="画一枚立体的金色心形徽章："
             "饱满的心形，金色金属渐变，左上有明显高光，边缘一道深金色描边，带柔和暖金色辉光。正面视角。",
    ),

    # ---------- D. 面板与装饰 ----------
    "panel.frame.ornate": dict(
        ref=CUT + "popup-confirm/panel-frame-full.png", size=(1024, 1024), seeds="98101,98102",
        desc="把 image1 中弹窗的【金色雕花外框】单独画出来："
             "一个大圆角矩形边框，双层金色描边，四角有对称的卷草花纹浮雕，"
             "边框内侧是深紫色半透明面板底。"
             "面板内部必须完全干净空白——不要画任何文字、按钮、插画或图标。",
    ),
    # 返工 2：首轮两个 seed 都 touches_edge=True（纹样触到画布边缘）。本轮加大画布并强调留白比例。
    # ---- panel.corner.ornament：已废弃 2026-09-12：出图是封闭圆形涡卷而非 L 形转角装饰；且 panel.frame.ornate 面板贴图
    # 本身已自带雕花边框与四角纹样，此槽位冗余。Owner 同意移除。
    # "panel.corner.ornament": dict(
    #     ref=CUT + "popup-games/panel-corner-ornament-tl.png", size=(1024, 1024), seeds="99301,99302",
    #     desc="把 image1 中面板角上那个金色卷草雕花装饰单独画出来："
    #          "一组优雅的金色卷草涡卷纹样，线条纤细，金属渐变和高光明显，带柔和暖金辉光。"
    #          "只画这个装饰纹样本身，不要画面板边框或背景。"
    #          "纹样只占画面中央约一半的面积，四周必须留出大片空白。",
    # ),
    "panel.header.room-info": dict(
        ref=CUT + "popup-manage/room-info-header-panel.png", size=(1280, 512), seeds="98301,98302",
        desc="把 image1 中房间信息头部的【空白底板】画出来："
             "一个横向大圆角矩形，紫色半透明渐变底，外圈一道淡紫色细描边，表面有玻璃质感高光。"
             "内部必须完全干净空白，不要任何头像、文字、图标或数字。",
    ),
    "icon.chevron": dict(
        ref=CUT + "popup-requests/chevron-expand-icon.png", size=(512, 512), seeds="98401,98402",
        desc="画一个简洁的展开箭头图标："
             "一个向右的 V 形箭头（大于号形状），笔画圆头，颜色是明亮的青蓝色，带轻微发光。"
             "只画箭头本身，不要画圆形底座或背景。",
    ),
    # ---- decor.stage-light：已废弃 2026-09-12：出图是带小字标签的横条而非舞台光晕——其参考 tile 本身就是切坏的
    # （把麦位名牌文字一并切入），坏参考污染了结果。且该光晕在 84001 中本就画在背景插画上，
    # 属背景层而非独立 UI 素材。Owner 同意移除。
    # "decor.stage-light": dict(
    #     ref=CUT + "main-room/stage-light-glow-wide.png", size=(1280, 512), seeds="98501,98502",
    #     desc="画一道横向的舞台金色光晕："
    #          "一个扁平的椭圆形暖金色光带，中心最亮、向上下和两端柔和衰减消失，像舞台地面的聚光。"
    #          "纯粹的光效，不要画任何实体物件、地板或人物。",
    # ),

    # ---------- E. 卡片与插画 ----------
    "card.game.frame": dict(
        ref=CUT + "popup-games/game-card-frame.png", size=(768, 1024), seeds="98601,98602",
        desc="把 image1 中游戏卡片的【空白边框】单独画出来："
             "一个竖向圆角矩形卡框，外圈一道明亮的紫色霓虹描边并带紫色外发光，"
             "内圈一道更细的描边，卡片内部是深紫色半透明底。"
             "卡片内部必须完全干净空白——不要画任何动物、图标、按钮或文字。",
    ),
    "card.game.hot-tag": dict(
        ref=CUT + "popup-games/hot-tag-ribbon.png", size=(512, 512), seeds="98701,98702",
        desc="画一个游戏卡角标丝带的【空白底板】："
             "一个小的橙红色圆角方形标签，表面有渐变和轻微高光，边缘一道深色描边，"
             "整体像贴在卡片左上角的小角标。标签内部必须干净空白，不要任何文字。",
    ),
    "button.play.small": dict(
        ref=CUT + "popup-games/play-triangle-button.png", size=(768, 512), seeds="98801,98802",
        desc="把 image1 中那个黄色播放按钮单独画出来："
             "一个横向圆角胶囊，明亮的金黄色渐变底面，外圈一道深金色描边，"
             "正中央一个白色或深色的实心三角形播放图标（尖角朝右）。除三角形外不要任何文字。",
    ),
    "illustration.leave-room": dict(
        ref=CUT + "popup-confirm/illustration-fox-door.png", size=(1024, 1024), seeds="98901,98902",
        desc="把 image1 中的插画单独画出来："
             "一只可爱的卡通橙色小狐狸站在一扇半开的门旁边，抬起一只前爪像在挥手告别，"
             "门内透出温暖的米黄色光。保持与 image1 一致的圆润卡通画风和配色。"
             "只画狐狸和门，不要画星空、地面或任何背景装饰。",
    ),
}
