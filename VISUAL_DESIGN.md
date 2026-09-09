# Visual Design: GAME BOX PWA 容器

**Concept-Derived Visual Tags**: `render-toy-diorama`, `composition-sky-world-path`, `geometry-rounded-wood-stone`

## 1. Visual Concept

一座可以直接触摸和探索的天空街机王国：导航是控制台，入口是浮空岛建筑，账号与社交功能分别属于通行站、邮局、通讯台和玩家小屋。固定美术由批准设计稿或清理后的生产底图提供；所有账号、钱包、好友、消息与验证码数据由独立语义 DOM 覆盖。

## 2. Color Palette

| Role | Color | Hex | Usage |
|:---|:---|:---|:---|
| World | Sky cyan | `#65cdf1` | 页面底色、状态栏、云海空间 |
| Primary | Portal green | `#38c95b` | 当前页、主要操作、在线状态 |
| Reward | Star gold | `#ffd84d` | 路径、奖励、视觉焦点 |
| Structure | Warm wood | `#9b5c2f` | 木牌、建筑、输入框边缘 |
| Alert | Mail red | `#ef5350` | 未读、退出、警示 |

## 3. Object Rendering Specifications

- 固定环境保持批准稿中的圆润 3D 玩具渲染、粗轮廓、暖木与石材高光。
- 首页游戏入口直接使用稿件中的浮空岛建筑；透明 DOM 只提供链接语义和按压反馈。
- 动态 HUD 使用空槽位底板，头像、等级文案、钻石数量分别渲染，禁止复用带示例数值的整图。
- 社交与账号页只在明确动态槽位显示真实数据；搜索、修改密码等复杂控件仅在玩家主动点击场景道具后出现。

## 4. Background & Environment

- 大厅：批准的天空地图原图，动态 HUD 覆盖示例值。
- 消息：保留邮局、望远镜和四个玩家木座的 clean 生产图，用户名、消息预览与未读数独立覆盖。
- 聊天：保留木制通讯台和五个空羊皮气泡的 clean 生产图，头像、在线状态与消息独立覆盖。
- 我的：保留玩家小屋与三个奖杯台的 clean 生产图，头像、用户名、UID 与统计独立覆盖。
- 鉴权：注册态严格使用 Studio Owner 指定的批准稿；登录态使用同构衍生稿；输入内容与验证码始终是实时 DOM。

## 5. Feedback Effects

| Event | Visual Response | Tag Reference |
|:---|:---|:---|
| Tab selected | 控制台按钮抬升并绿色点亮 | `render-toy-diorama` |
| Primary action | 绿色木框按钮压下 | `geometry-rounded-wood-stone` |
| Unread message | 信封附近出现独立红色圆章 | `composition-sky-world-path` |
| Online state | 联系人名牌显示绿色状态 | `render-toy-diorama` |

## 6. Relationship with Visual Tags

`render-toy-diorama` 统一材质和光照，`composition-sky-world-path` 让视线沿道路和建筑移动，`geometry-rounded-wood-stone` 把所有交互变成游戏世界中的实体道具而非网页卡片。

## 7. AI-Generated Look Suppression Rules

### 7.1 Visual Hierarchy Rules

- Protagonist: GAME BOX 绿色方块向导与当前页主建筑。
- Threat: 本容器无玩法威胁；错误与退出只使用红色实体木牌。
- Reward: 金色星星、黄色道路与绿色当前操作。
- 2-second recognition check: 玩家应在两秒内识别当前建筑、主操作和底部三页导航。

### 7.2 Limits on Familiar Template Symbols

- Adopted familiar elements (max 2): 游戏手柄、聊天气泡。
- Replaced unique element: 网页 Tab/卡片替换为石制控制台、浮空岛建筑与木牌。

### 7.3 UI-Independent Feedback

| Event | Non-UI visual response | Intensity (Low/Med/High) |
| :---- | :--------------------- | :----------------------- |
| Navigation | 当前控制台按钮抬升并发出绿色边缘光 | Low |
| Message | 信封红章提示未读 | Med |
| Authentication | 通行站绿色门票按钮承担主操作 | Med |

### 7.4 Composition and Gaze Guidance

- Initial focal point: 当前页中央建筑或传送门。
- Visual flow: 顶部品牌 → 中央建筑/道路 → 底部控制台。
- Anti-center-clutter implementation: 仅当前任务数据进入中央槽位；长期 HUD 固定在顶部边缘。
