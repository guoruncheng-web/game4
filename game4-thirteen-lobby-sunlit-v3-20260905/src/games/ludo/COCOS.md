# Ludo 的 Cocos 版:给 Codex 的对接说明

> **这一款有两份实现,而且只有一份在这个仓库里。**
> 盒子里的 `src/games/ludo/`(Next.js + Three.js)已经停在原地不再演进;
> 正在做的是 Cocos Creator 版,项目在 **Mac 的 `/Users/mac/projects/ludo`**(不在本仓库、也不在 git 里)。
> 两边**共用同一份规则内核**(`config.ts` + `sim/*`,逐字节相同),
> 所以改规则要先想清楚改的是哪一边 —— 详见 §5。
>
> 控制 Cocos 编辑器的 MCP 叫 cocos-mcp,仓库在 `/home/jojo/work/cocos-mcp`
> (Mac 上是 `/Users/mac/projects/cocos-mcp`,**同一份,不是副本**),同样不在本仓库里。

这份只讲**怎么接进 Codex、接进来之后怎么用不踩坑**。
工具清单、每个工具做什么、为什么控制的是 Creator 而不是 Dashboard —— 都在 cocos-mcp 自己的 `README.md` 里,不重复。

---

## 1. 注册

Codex 读 `~/.codex/config.toml`。加这一段(位置随意,和已有的 `[mcp_servers.node_repl]` 平级):

```toml
[mcp_servers.cocos]
command = "/opt/homebrew/bin/node"
args = ["/Users/mac/projects/cocos-mcp/src/index.mjs"]
startup_timeout_sec = 120

[mcp_servers.cocos.env]
# 不写就是默认的 ~/projects,~/test。所有路径参数都会被钉在这些根目录里
COCOS_MCP_ROOTS = "/Users/mac/projects,/Users/mac/test"
```

**node 必须写绝对路径。** Codex 拉起子进程时的 PATH 不一定有 node,写 `node` 大概率是
「MCP 起不来」而不是「报错说找不到 node」。

Codex 跑在 Linux 上的话,MCP 仍然**必须跑在 Mac 上**(编辑器在 Mac),用 ssh 转发 stdio:

```toml
[mcp_servers.cocos]
command = "ssh"
args = ["-o", "BatchMode=yes", "mac@192.168.64.1",
        "/opt/homebrew/bin/node /Users/mac/projects/cocos-mcp/src/index.mjs"]
startup_timeout_sec = 120
```

仓库目录在 Mac(`/Users/mac/projects/cocos-mcp`)和 Linux(`/home/jojo/work/cocos-mcp`)是**同一份**,
不是两个副本 —— 所以不需要拷贝任何东西,但**路径参数一律写 Mac 那边的**。

## 2. 接好之后先跑这三步

```
list_engines      # 引擎在不在、有哪些模板
list_projects     # 看得到 ludo / game5 就说明根目录对了
scene_status      # 桥通不通、当前开的哪个场景、有没有未保存改动
```

`scene_status` 报「桥没连上」的三种可能,按这个顺序查:

1. **Cocos Creator 根本没开**(只开着 Dashboard 不算);
2. 项目的 `extensions/cocos-mcp-bridge` 不在 —— 用 `install_bridge` 装,**装完必须重启编辑器**。
   放 `~/.CocosCreator/extensions` 那个全局目录**不会被加载**;
3. 编辑器弹了原生对话框 —— 这时**所有场景工具都会超时,而 `scene_status` 仍说就绪**,
   用 `check_dialog` 看一眼再点掉。

## 3. 已知的坑(2026-08-20 实测,已改源码)

### 3.1 `set_property` 的对象参数会被写坏

`value` 的 schema 是 `z.any()`,而不少 MCP 客户端会把 `{x,y,z}`、`{uuid}` 这类对象
**序列化成字符串**发过来。桥原样透传给编辑器的结果是:

- `position` 被写成 `{}`,
- 资源引用(Prefab / SpriteFrame / 组件引用)被写成空,
- 数字被写成 `"8.6"` 这种字符串,
- **而且返回的仍然是「已设置」。**

已在 `src/index.mjs` 加 `coerceValue()`(字符串看着像 JSON 就 parse)。用新起的进程就已经带上了。

**但这类错的本质是「返回成功、实际没生效」,所以规矩不变:凡是设过引用或向量,
立刻 `node_detail` 复查一遍值。** 复查发现还是空的,退路有两条:

- 摆位/尺寸这类**纯数值参数写进脚本常量**,别走 `@property`;
- 资源**不要靠拖引用**,挪进 `assets/resources/` 后用 `resources.load('路径', 类型, cb)` 取。
  ludo 现在就是这么做的(见 §5)。

> `@property` 的值是**存在场景文件里**的 —— 改脚本里的默认值对已经保存过的场景**不生效**。
> 这一条单独踩过一次:改了默认 `pawnScale` 却毫无变化,因为场景里存的还是旧值。

### 3.2 `run_game` 的 `screenshot` 参数曾经直接报错

`ensureInside is not defined`(`src/index.mjs` 漏了 import),已补。
万一又遇到,不用等修:直接调底层函数截图,不经过 MCP ——

```bash
/opt/homebrew/bin/node -e "
import('/Users/mac/projects/cocos-mcp/src/runtime.mjs').then(async (m) => {
  const r = await m.runPreview({
    url: 'http://192.168.11.142:7456/',   // 预览地址,preview_url 工具能拿到
    seconds: 14,
    screenshot: '/Users/mac/projects/ludo/shot.png',
  });
  console.log(JSON.stringify(r.events || []));
});
"
```

### 3.3 同一个项目里别挂两套桥

`ludo/extensions/` 下现在除了 `cocos-mcp-bridge`,还有第三方的 `cocos-mcp-server`(CocosMCPPlugin 出的)。
两套桥抢同一批 `scene` 消息,桥中途掉线过。**动手前先确认只留一套。**

## 4. 操作纪律(全是实测踩出来的,别省)

- **改动只在编辑器内存里,不调 `save_scene` 就不落盘。** `run_game` 跑的是**已保存**的场景。
- **「没报错」不等于「功能对」,也不等于「画面对」。**
  - 用 `run_game` 的 `expression` 断言功能真的生效(查节点数量、坐标、状态值);
  - 再截一张图看画面。今天就靠截图才发现相机被写到了原点、整张棋盘根本没进画面 ——
    这种事断言和日志都照不出来。
- **在编辑器外改了 `assets/` 下的文件,必须 `refresh_assets`**,否则编辑器手上还是旧的;
  改完脚本要**留几秒让它编译**再跑。
- **编译报错只在 `editor_log` 里**,而且日志是累积的 —— 判断「我刚才那次改动有没有报错」
  必须带 `sinceMinutes`,不然会把几小时前修好的旧错当成新错。
- **程序化做动画一律用 Tween 脚本,不要生成 `.anim`。**
  手写 `.anim` 踩过最狠的一次:文件建了、导入了、`playing` 也是 `true`,节点纹丝不动。
- **`build_project` 必须显式给 `startScene`**,否则启动场景跟着「编辑器最后打开的那个」走。
- `create_node` 不传 `parent` **不一定挂在场景根下**(会跟当前选中项走)。建完用 `scene_tree`
  确认一眼 —— 踩过一次:节点挂到了 Main Camera 底下,于是所有棋子跟着相机一起飞。

## 5. 当前在做的项目:ludo

`/Users/mac/projects/ludo`(Creator 3.8.8,**不在 git 里**)。
它是从本仓库的 `src/games/ludo/`(Next.js + Three.js)迁过来的 —— Mac 上同一份路径是
`/Users/mac/projects/oner/game/game4/src/games/ludo`。

**规则内核两边逐字节同一份**(和本仓库 `src/games/ludo/{config.ts,sim/}` 比对过):`assets/scripts/config.ts` + `assets/scripts/sim/{board,layout,rules,game}.ts`。
纯 TS、不碰渲染、不碰 window。**Cocos 这边只写表现层,不要往 sim 里塞规则**;
Three 版的 `three/*`、`world.ts`、`ui/hud.ts` 已经确定不搬、不改。

```
assets/scripts/
  config.ts        规则参数(TRACK=56、每人 4 子、掷 2 选 1 …)
  sim/             规则内核 + 回合状态机 + 棋盘几何(和 game4 同一份)
  view/coords.ts   15×15 网格 → 世界坐标:俯视、一格 = 1、屏幕上 = -Z
  view/PieceView.ts 一颗棋子的表现(走格/出子/被撞/高亮),全 Tween
  ui/Hud.ts        对局 HUD,运行时用代码搭出来
  LudoGame.ts      接线 + 回合驱动 + 拾取,相机和灯光也在代码里摆
assets/resources/  models / ui / avatars / textures / audio —— 一律 resources.load 取
assets/scene/      Game.scene(对局,已能跑) + main.scene
```

已经跑通:棋盘 + 16 颗棋子 + 完整回合循环(本地玩家 + 3 个机器人),`run_game` 无异常。

接下来要做的:

1. **五个场景**(本仓库 `src/games/ludo/DESIGN.md` §2):加载 → 大厅 → 房间 → 开局动画 → 对局。现在只有对局。
2. **UI 必须和现有素材一致** —— 版式照 本仓库 `src/games/ludo/image/` 下的概念图,
   按钮/图标/头像/弹窗底板用 `assets/resources/ui`、`assets/resources/avatars` 里那批。
   现在的 HUD 是纯文字占位,要换掉。
3. **`textures/board.png` 得重出。** 采样验证过:它**红色占了两条终点道、绿色一条都没有**,
   和本仓库 `src/games/ludo/ART.md` §4 的硬约束(外圈 56 格 / 每家 6 格终点道 / 四个入场格 / 四个 ★ 安全格)对不上。
   棋盘底图画错的后果是玩家按图上的路线走,结果和规则对不上 —— 出图后先采样校验再接。
