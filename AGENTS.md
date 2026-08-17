# Codex 项目说明

本仓库的完整工程规范位于 `CLAUDE.md`。所有 Codex 主 Agent 和子 Agent 在执行项目前必须先完整阅读该文件，并遵守其中的目录、Phaser、SSR、物理、资源和验证约定。

## 自定义 Agent

项目在 `.codex/agents/` 提供三个 Codex 自定义 Agent：

- `game_producer`：玩法与产品规格。新游戏立项、核心循环、难度与 `DESIGN.md` 使用。
- `game_artist`：美术、素材、动效与音效。视觉方向、`ART.md`、`textures.ts`、`sfx.ts` 使用。
- `playtest_critic`：只读玩法审查。玩法实现或调整后用于静态防回归，只报告不修复。

用户明确要求多 Agent、子 Agent 或并行协作时，按任务边界调用对应角色。写密集型任务不要并行编辑同一文件；试玩批评应在实现完成后运行。

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
