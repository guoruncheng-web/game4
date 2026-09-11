# PWA “准备环境中” 概念与批准记录

## 批准结论

- **Concept ID**：`PWA-PREPARE-31104`
- **范围**：PWA 首次进入首页、以及点“立即刷新”切换版本时显示的“准备环境中”全屏页；仅此一屏及其背景插画，不授权其他页面或资产族。
- **状态**：approved（Studio Owner 于 2026-09-11 在会话中从 31104 / 31103 两版完整页面效果图中明确选定 “31104”）。
- **已否决**：31101（小鸡拿的是游戏机，不贴合“搬运准备”）、31102 / 31103（未选）、Z-Image 纯文字批次 `prepare_zg_*`（烘焙进度条/播放按钮且吉祥物不一致）、早期 `prepare_v1_*`（烘焙进度条）与 `prepare_v2_*`（风格偏 H5，Owner 要求改为游戏风格）。

## 批准的完整页面效果

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `concept-page-31104-approved.png` | 393×852@2x 完整页面效果（标题、说明、进度条、先进入按钮均为页面文字，示意进度 62%） | `8bd61776d3e1592d8a4ace75af2661ee2de30db438d90a1da0f7d809b41102e7` |
| `concept-compare-31104-vs-31103.png` | 评审时的两版对比 | `82ee3d5cefe2070b39575b1c3fd37cfcec8fa1de807647434a1ee4471d652028` |
| `prepare_qe1_31104-source.png` | 无文字原始插画 768×1664 | `cc1e78c72e185ed3cc40be41c1cac596e83c5a70e1a07e82911814dc09be8229` |

## 生成来源

- 工具：云端 ComfyUI（RTX 4090），模型 `Qwen edit/qwen_image_edit_2511_fp8mixed.safetensors` + LoRA `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16`，文本编码 `qwen_2.5_vl_7b_fp8_scaled`，VAE `qwen_image_vae`；4 步、CFG 1、euler/simple，seed `31104`，输出 768×1664。
- 参考图（均为本仓库已上线的自有素材）：`public/assets/game-box/v5/voice-hero.webp`（SHA-256 `d4304fcae3a1a9bad663411dbd4448e1e39bacfa6d5b3170f645b2cb293006d1`）、`ref_home_mascots.png`、`ref_messages_cube.png`（均裁自 `public/assets/game-box/v5/pwa-main-reference-atlas.png`）。
- 提示词要点：同参考图的光泽 3D 卡通游戏画风；绿色方块（紫耳机、麦克风）与黄色小鸡抱礼物盒走过彩虹桥前往漂浮糖果城堡；上方 60% 为角色与城堡，下方 40% 为云层；无文字、无 Logo、无进度条/按钮/界面。
- 已知近似：小鸡头顶卷毛形状与首页原稿略有差异；绿色方块多了麦克风（与语聊头图一致）。

## 生产资产

| Asset ID | Skin Slot | 运行时文件 | 消费者 | 规格 | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `pwa.prepare.background.v1` | `pwa.prepare.background.default` | `public/assets/game-box/prepare/prepare-castle-v1.webp` | `src/app/pwa-prepare.css` → `.gb-prepare-art` 的 `background-image` | 768×1664 WebP q82（79 KB），`cover`，定位 `center 36%`；不含任何文字/界面 | `b77dfa08964062e57018e10e56ac1871711a44eab785b3057b4410d8ed3f19c9` |

换皮合同：替换图须为竖屏约 0.46 宽高比、角色与主体位于上方 60%、下方 40% 为可被渐变覆盖的低细节区域，且不得烘焙文字、进度条或按钮。标题、说明、进度、按钮均由 `src/components/PwaPrepare.tsx` 动态渲染。
