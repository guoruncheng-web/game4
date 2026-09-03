# Thirteen Single-diamond P0 v1 发布记录

状态：**本地生产验收通过，等待本文件所在提交触发 Actions 与公网复验**

日期：2026-09-02

## 跨仓版本

- Cocos 源仓分支：`feat/modern-doudizhu-ui`
- Cocos 源提交：`56b5d1be14777fc9e55651b20b3eff3e14f208e0`
- game4 发布提交：本文件所在提交
- Cocos Web Mobile 树：594 文件，21,401,304 bytes，SHA-256 `26b252d22739f548e75a5a3e09fcdf8f39d32a98f85620d7fe53d0fac5f41981`
- Service Worker：`v54`
- 回滚基线：`origin/main` 的部署前提交 `ce77a5d`；部署前 Thirteen 游戏树已移动到 Mac 工作盘命名备份，不修改原始 game4 脏工作区。

## 产品结果

- game4 钻石是唯一持久虚拟货币；新注册账号只按平台配置发放 10,000 钻石，不再创建或赠送 Thirteen 牌币。
- 所有新快速匹配、私人房、取消、重连、重赛与结算均为 `free-v1`；不冻结、不结算、不退款新牌币，也不改变钻石。
- `/api/games/thirteen/exchange` 稳定退役且无副作用；历史牌币账本只读保留用于审计和旧在途房处理。
- R02/R03/R06/R07/O05 五张完整场景已由 Studio Owner 精确批准并完成 Creator 三视口验收；生产发行清单不含 R08/O04。
- P0 API 提供版本、最近战绩、客服/申诉、数据导出与强确认注销；牌局历史对内部 ID 做边界隔离，注销后匿名保留必要审计记录。

## 本地发布门

| 门禁 | 结果 |
|---|---|
| game4 ESLint | 通过 |
| Next 16.3 production build | 通过，`/thirteen` 已生成 |
| Thirteen 服务/房间测试 | 通过 |
| 钱包迁移/钱包 API/P0 API | 通过；钻石不变、新牌币钱包/流水为 0 |
| 四真实账号 WebSocket | 20 局、1,107 动作、20/20 归档、免费重赛与释放通过 |
| 动态账号 UID/token 链路 | cookie→短期 token→URL→iframe→WebSocket 通过；测试账号已清理 |
| 未认证 PWA | v54、118 静态资源、21/21 音频、可信点击 running、离线 R02 通过 |
| 认证 PWA | 六位 UID/真实头像/10,000 钻石、免费快速/私房、R06/O05、Header 透传、离线 R02 通过；测试账号已清理 |
| 宿主退出桥 | 竖屏 O02 返回卸载 iframe，横屏 R02 宿主控制正确 |

最终 PWA 同一文件树的本地证据位于：

`/Users/mac/projects/.codex-tmp/evidence/thirteen-single-diamond-p0-20260902/game4-final-exact/`

## 公网门

提交推送后必须补齐 Actions 成功、远端 HEAD、生产发行哈希、`/ws/health`、未授权 API 401、全新 852×393 profile 在线/可信音频/缓存/离线重载。任何单项未通过都不能把本记录升级为 `public accepted`。
