# 趣宝玩 PWA 游戏仓库

全部游戏源码归个人账号 **guoruncheng-web**，游戏仓库均为私密仓库。PWA 页面宿主仍在 `guoruncheng-web/game4`，个人 Nest 后端仍在 `guoruncheng-web/game-studio-backend`。

| 游戏 | 独立仓库 | PWA 引用方式 |
| --- | --- | --- |
| 星际跑酷 | guoruncheng-web/star-runner | 固定提交的源码子模块 |
| 水果乱斗 | guoruncheng-web/fruit-slasher | 固定提交的源码子模块 |
| 霓虹突击 3D | guoruncheng-web/neon-strike | 固定提交的源码子模块 |
| 霓虹突击 2D | guoruncheng-web/neon-strike-2d | 固定提交的源码子模块 |
| 3D 台球 | guoruncheng-web/eight-ball | 固定提交的源码子模块 |
| 叠叠消 | guoruncheng-web/triple-pile | 固定提交的源码子模块 |
| 捕鱼达人 | guoruncheng-web/fish-hunter | 固定提交的源码子模块 |
| 飞行棋（PWA Phaser 版） | guoruncheng-web/ludo | 固定提交的源码子模块 |
| UMO | guoruncheng-web/umo | 既有 Cocos 构建包 |
| 南方十三张 | guoruncheng-web/Thirteen | 既有 Cocos 构建包 |
| 十三张 Social | guoruncheng-web/thirteen-social | 既有 Cocos 构建包 |
| 十三张 · 语聊牌桌 | guoruncheng-web/vietnam-thirteen | 既有 Cocos 构建包／个人 PWA 适配 |
| 多米诺 | guoruncheng-web/domino | 既有 Cocos 构建包／个人 PWA 适配 |

最后两款游戏的 PWA 页面接入原本位于另一个未提交的工作区。本迁移的游戏源码快照来自 `game4@a7f933a`，并核对这 8 款源码、页面、素材和工具与最新远端主分支 `21a1f0c` 完全一致；PWA 集成基于该最新主分支，保留十三张 Social 及现行宿主修改。登记最后两款游戏的已有独立仓库，不合入或覆盖原工作区的接入改动。表中的全部 13 款游戏都有独立源码仓库，不表示这个迁移分支已新增或验收了最后两款游戏的页面。

## 首次获取

```sh
git clone --recurse-submodules https://github.com/guoruncheng-web/game4.git
cd game4
# 已有 checkout：git submodule update --init --recursive
pnpm games:prepare
pnpm dev
```

Git 身份必须有个人账号下这些私密仓库的读取权限。PWA 的默认 `GITHUB_TOKEN` 只能读取自身仓库，不能视为有跨仓库权限；CI checkout 需要单独配置具有指定游戏仓库只读权限的 GitHub App、细粒度令牌或等价凭据，并拉取固定子模块。凭据不能写入仓库。不要复用公司的活动账号或修改共享全局认证。

本迁移不调整历史部署 workflow、不配置新的 CI 密钥、不触发线上部署。现有 workflow 仍指向旧服务器，按 `deploy/README.md` 的现行部署边界处理。

## 日常开发

8 款源码游戏的 `src/games/<slug>/` 是 Git submodule。目录根的 `index.ts` 是游戏入口，`pwa/page.tsx` 是游戏专属页面，`public/<slug>/` 是完整专属静态素材，`tools/` 是原有素材制作工具。游戏源码中的相对 import 和素材 URL 保持原样；制作工具中指向旧 `src/games/<slug>/` 的路径已迁移到游戏仓库根。

PWA 的 `src/app/<slug>/page.tsx` 只转发独立游戏页面。公共容器、登录、语音、钱包、房间宿主、元数据和后端服务仍由 PWA 与个人 Nest 仓库维护，游戏页面使用宿主的 `@/components`、`@/lib` 等接口。独立仓库是游戏源码包，不是各自复制一套账号、钱包或后端的独立站点。

```sh
# 在游戏自己的子模块目录创建个人功能分支，修改、验证、提交并推送。
cd src/games/star-runner
git switch -c feat/example
# 完成后 git add <明确文件>、git commit、git push -u origin feat/example

# 回到 PWA，更新锁文件与素材，再验证集成。
cd ../../..
pnpm games:lock
pnpm games:prepare
pnpm games:test
pnpm games:check
pnpm lint
pnpm build
# 玩法变化另做实际运行与对应后端协议验收。
git add src/games/star-runner games.lock.json
```

不要使用 `git submodule update --remote` 自动升级所有游戏。游戏提交先推送到正确个人仓库，再提交 PWA 的单个子模块指针与锁文件，避免出现无法从远端获得的版本。若只改素材制作脚本，同样在游戏仓库提交。

`public/<slug>/` 是 `games:prepare` 生成的素材目录，已从 PWA Git 跟踪中移除；不要编辑这些生成副本。`pnpm dev`、`pnpm build`、`pnpm start` 的前置步骤会同步这些素材。`games:check` 比较源文件与输出的文件清单及逐文件 SHA-256，拒绝锁版本不符或未提交的游戏源码。`games:lock` 只更新显式 checkout 的已提交游戏版本，不拉取远端。

5 款 Cocos 游戏沿用自己的源码仓库和既有构建接入路径，本次没有重建、升级或替换它们的构建包。`games.lock.json` 对这五款记录源码归属与产物路径，不伪造既有构建包无法证实的源码 SHA。

## 范围和证据

8 个新仓库的 `extraction.json` 记录 `game4` 来源提交、原路径、新路径和 SHA-256；原始历史继续保留在 game4。游戏运行源码、页面及素材按字节迁移；仅制作脚本中的源码目录引用做必要重定位。专项证据位于 `evidence/game-repository-split-20261108/`。

公司 `typing-guoruncheng` 游戏仓库、`games/` 公司工程、模板、bene 宿主、公司钱包和公司 CDN 都不属于本迁移。GitHub 分支推送不代表个人站点或公司服务已发布。
