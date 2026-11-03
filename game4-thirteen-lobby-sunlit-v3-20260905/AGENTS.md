# Codex 项目说明

本仓库的完整工程规范位于 `CLAUDE.md`。所有 Codex 主 Agent 和子 Agent 在执行项目前必须先完整阅读该文件，并遵守其中的目录、Phaser、SSR、物理、资源和验证约定。

## 自定义 Agent

项目在 `.codex/agents/` 提供五个 Codex 自定义 Agent：

- `game_producer`：玩法与产品规格。新游戏立项、核心循环、难度与 `DESIGN.md` 使用。
- `game_artist`：美术、素材、动效与音效。视觉方向、`ART.md`、`textures.ts`、`sfx.ts` 使用。
- `game_vfx_designer`：特效专项。粒子、转场、Effekseer、Three.js/Phaser 动效、关键帧同步与性能使用。
- `game_audio_designer`：音效专项。SFX、WebAudio、rFXGen、生成式音频、分层混音与 `SOUND.md` 使用。
- `playtest_critic`：只读玩法审查。玩法实现或调整后用于静态防回归，只报告不修复。

用户明确要求多 Agent、子 Agent 或并行协作时，按任务边界调用对应角色。`game_artist` 负责总体视觉语言，`game_vfx_designer` 与 `game_audio_designer` 分别负责特效和声音专项；写密集型任务不要并行编辑同一文件，试玩批评应在实现完成后运行。

## 验证

代码修改完成后至少运行：

```bash
pnpm lint
pnpm build
```

不要用裸 `tsc --noEmit` 代替 Next.js 生产构建。


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## 资源生成
- 会部署一个云主机,这个主机上装了comfyui 可以用它来生成游戏需要的素材
- comfyui 不需要提交到github上面
- 页面中所有图标和图片尽量使用内置的image去生成,不用用svg
- 我本地安装了belender 可以使用这个生成3d素材
- 霓虹突击的 3D 模型由 `tools/blender/neon-strike/build_models.py` 无头生成(敌机 / Boss / 三种场景结构物),
  改了脚本要在装了 Blender 的机器上重跑:
  `blender -b --python tools/blender/neon-strike/build_models.py -- public/neon-strike/models`
  产出的 glb 进仓库;结构物(`prop-*.glb`)缺失时 Stage 会自动回落到程序化柱体,
  障碍物(`obstacle-*.glb`)缺失时这一局就没有障碍物 —— 都不会报错、不会开不了局
- 可以使用 rFXGen 来生成游戏音效，我在本机(mac)上安装好了
  (`~/Applications/rFXGen/rfxgen_v5.0_macos/rfxgen.app/Contents/MacOS/rfxgen`,支持 `--input x.rfx --output x.wav --format 44100,16,1` 无 GUI 渲染;
  Linux VM 里可以 `ssh mac@192.168.64.1` 直接调它)
- 霓虹突击的音效由 `tools/audio/neon-strike/build_sfx.mjs` 生成:
  脚本写出 `presets/*.rfx`(rFXGen 原生参数文件)→ 调 rFXGen 渲染每一层 → 混层 + 峰值归一 → `public/neon-strike/assets/audio/*.wav`。
  `node tools/audio/neon-strike/build_sfx.mjs --ssh mac@192.168.64.1`(或 `--rfxgen <二进制路径>` 在 Mac 本地跑)。
  想手调音色就用 rFXGen GUI 打开对应的 `.rfx` 存回原文件,再跑一遍脚本;改了音频文件记得把 `public/sw.js` 的 `VERSION` 加一档
- 可以使用 Effekseer 来生成游戏特效，我在本机(mac)上安装好了
- 对于threejs开发的游戏可以使用 three-nebula 生成素材
- 对于threejs开发的游戏可以使用 Phaser3-Particle-Editor 生成素材


# nodel_modules 目录安装依赖只能我在mac上面自己安装,不用你在linux帮我安装

# 图片生成约定
1. 游戏里面的所有需要用到的按钮统一生成按钮图片
2. 需要为每一个游戏设计一个统一的弹窗背景
3. 所有模块的背景统一生成图片替换
4. 所有需要用到的图标统一用图片不用用emoj
5. 每次生成一个图片需要记录一下这个图片的用处
6. 素材生成需要参考概念图不要自己随意生成
