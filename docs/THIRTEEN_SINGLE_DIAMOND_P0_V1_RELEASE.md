# Thirteen Single-diamond P0 v1 发布记录

状态：**public accepted；生产部署与公网复验通过**

日期：2026-09-02

## 跨仓版本

- Cocos 源仓分支：`feat/modern-doudizhu-ui`
- Cocos 源提交：`56b5d1be14777fc9e55651b20b3eff3e14f208e0`
- game4 发布载荷提交：`1da8362dbc821d6beea9ddd3f87c172e934ee51d`
- game4 公网验收记录：本文件所在的后续文档提交
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

| 门禁 | 结果 |
|---|---|
| Actions 生产部署 | run `33729727039` 全部步骤通过；发布载荷提交 `1da8362dbc821d6beea9ddd3f87c172e934ee51d` |
| 路由与发行哈希 | `https://www.gameai.xingzdh.com/thirteen` 为 200；公网 Cocos `index.html` SHA-256 与本地精确构建一致：`a9d16616a00caf51f20e16e80a407265cdabf76b8def6dadfd1a682ec0e61cdc` |
| 版本与迁移边界 | `2.0.0-rc.1`、协议 v2、`source-locked-v1`、`free-v1`、唯一货币 `diamond`；下注/兑换关闭，历史/导出/注销/客服开启 |
| 服务健康 | `/ws/health` 为 `ok=true`、房间 0、待写事务 0、持久化 `encrypted-ready` |
| 未授权边界 | 钱包、战绩、导出、客服 POST、兑换 POST、账户 DELETE 均为 401；账户 GET 因只支持 DELETE 返回 405 |
| 全新游客 PWA | 852×393、Service Worker v54、118 个静态资产、21/21 音频、首次可信点击 `running`、在线 Canvas 与离线 R02 通过 |
| 全新真实账号 PWA | 六位 UID、真实头像、10,000 钻石、免费私人房/快速匹配、R06/O05、UID+Bearer 请求、O04 隐藏、在线/离线与可信音频全部通过；该验收账号已由正式注销接口删除 |

公网证据位于：

`/Users/mac/projects/.codex-tmp/evidence/thirteen-single-diamond-p0-20260902/public/`

主要文件：`public-pwa-852x393.json`、`public-offline-852x393.png`、`public-auth-real.json`、`public-auth-online-real.png`、`public-auth-offline-real.png`、`public-auth-delete.json`。

## 验收探针审计例外

在最终通过前，首个公网实名态探针错误地只用长期会话 cookie 调用要求六位 UID + Bearer 的头像与注销接口，得到 401；探针随后提前销毁了一次性账号凭据。该随机账号未进入游戏、未产生房间/战绩/交易，仅保留平台注册欢迎钻石。因为公开 API 没有管理员枚举能力，不能在不知道精确 UID 的情况下安全删除；应由生产数据库维护人员按 2026-09-03 约 16:00 的创建时间和无活动条件审计并清理。最终复跑已修正为双凭据，所有断言通过且账号注销成功。此例外属于测试数据卫生，不改变产品门禁结果，但在完成后台清理前不得宣称“所有测试账号均已清除”。
