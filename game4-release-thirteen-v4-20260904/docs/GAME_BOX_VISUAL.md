# GAME BOX 容器视觉规范

## 视觉支柱

- **掌上游戏厅**：容器使用深海军蓝舞台，不与各游戏自身的美术风格竞争。
- **荧光引导**：`#5ff0a6` 只用于当前状态、主操作和在线反馈，避免全屏泛绿。
- **柔和承载**：内容区使用薄荷白与高圆角卡片，保证不同游戏封面放在一起仍然统一。

## 形状与层级

- 品牌区与底部导航使用稳定的圆角矩形；游戏内容使用更大的 2rem 圆角。
- 当前 Tab 通过发光色块和文字颜色共同表达，不能只依赖颜色。
- 顶部安全区属于品牌舞台，`html`、`body`、PWA theme color 均使用 `#0b2032`，禁止出现白色断层。

## 色彩角色

- 品牌背景：`#0b2032`
- 主交互：`#5ff0a6`
- 内容背景：`#eef9f4`
- 危险 / 未读：`#f43f5e`
- 次级文字：`#94a3b8`

## PWA 图标资产记录

- `public/icons/pwa-icon-master-v2.png`：PWA 图标母版；深海军蓝圆角底、荧光绿立体手柄，主体位于中央 maskable 安全区。由内置 imagegen 生成。
- `public/icons/icon-192.png`、`icon-512.png`：Web App Manifest 常规图标，由母版缩放生成。
- `public/icons/maskable-512.png`：Android 自适应裁切图标，母版的中心构图可承受圆形、水滴形裁切。
- `public/icons/apple-touch-icon.png`：iOS 主屏幕图标，由不透明母版缩放生成。
