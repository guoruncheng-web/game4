# PWA 房间语音与按需部署验收

已生产发布：frontend `047f468c39a35c0afcfc715d5e1498ae2cae801d`，固定 backend `dd3a27da774a8e171da98532a1a6d33ef2294cb9`，PWA `v85`。[Actions 34488650137](https://github.com/guoruncheng-web/game4/actions/runs/34488650137) success；公网主页 200、匿名鉴权 401、Service Worker v85 已复核。后续文档与证据提交不改变生产固定修订。

## 使用与权限

只接入声网 RTC 语音，房间与文字消息仍由原 HTTP API 管理，不引入 RTM。点击“加入语音”才动态加载 SDK、申请成员票据并以听众身份加入；申请上麦与管理员审批沿用后端，用户主动开启麦克风后才发布音频。关闭麦克风、下麦、禁麦、离房、房间关闭、登出、页面退出或鉴权失败时停止采集。网络恢复只恢复收听，不自动开麦；游戏 iframe 打开期间外层房间会话保持。

使用 AEC/ANS/AGC、speech_standard，不采集摄像头。自动播放受限时提供“播放声音”按钮。SDK 票据、客户端与音轨不进入全局变量、日志或持久存储。测试探针只记录音轨生命周期、音频字节与票据请求次数，使用合成麦克风，不读取真实环境声音。

后端票据绑定真实 UID、房间和麦位权限，有效期为 min(配置有效期, 120 秒, 平台登录剩余时间)。客户端每 30 秒经网关重新鉴权续期，房间状态每 4 秒同步。声网媒体连接独立于平台会话；已签出票据不能仅靠平台登出瞬间撤回，修改过的客户端可能保留最多 120 秒旧媒体权限。未实现声网服务端踢人 REST 管理，不宣称瞬时硬撤权。

## 验证结果

- 前端 lint、生产构建、11 项语音会话/SDK 清理测试、9 项按需部署规则测试通过。
- 后端 lint、20 项单元测试和五服务构建通过；候选使用独立 gateway 17100、voice 17104、PWA 3338，完成后均已停止。
- 本地 `evidence/voice-rtc-nested-cleanup/result.json`：18 项断言通过，含连续八次断网恢复；browserErrors=[]、accountsCleaned=true，进程退出码 0。
- 公网 `backend/evidence/production-rtc-v85/`：真实双端声网连接、双向音频字节、审批禁麦、游戏弹窗期间通话、自动续期、主动重连、三次断网恢复、房间关闭共 13 项断言通过，browserErrors=[]；独立 workflow 账号清理成功。
- 本次成功流程 14:22:41–14:29:08 UTC，共 6 分 27 秒。前一轮全量成功流程 34472909374 为 20 分 42 秒；这是两次实际流程记录，不能视为同负载性能基准或后续耗时承诺。当前候选服务器构建与切换 100 秒，基础公网检查 18 秒，双端语音 139 秒。

未验证 iOS/Android 真机、后台锁屏、蓝牙耳机与真实麦克风声学质量，不以合成音频验收替代这些场景。

## 按需发布

使用当前生产 frontend/backend 修订与候选的累计差异选择验收，而非只比较 HEAD 的父提交，避免遗漏曾经失败的发布。仅文档/证据变化不部署；语音变化运行基础与 RTC 验收；十三张/UMO 变化运行对应套件；鉴权、网关、公共依赖或未知范围运行全验，允许手动 full_acceptance。所有实际部署保留基础健康/鉴权、候选隔离构建、版本防并发、临时账号清理及失败回滚。

本次未受影响的四个游戏浏览器套件均为 skipped，不宣称本次重新验收了游戏音频、离线和全部游戏玩法。SDK 依赖只新增 RTC 依赖树；旧依赖版本、完整性和解析记录保持不变，registry 的 deprecated 提示文本不影响运行依赖判断。规则及说明见 `deploy/acceptance-plan.mjs`、`deploy/README.md`。

## SDK 修复及失败证据

固定 `agora-rtc-sdk-ng@4.24.8`、`packageManager=pnpm@9.15.9` 和 pnpm patch 哈希。SDK 发布被断网打断时，外层 `_publishHighStream` 两处及内层媒体发布两处未等待 async generator.throw()，会泄漏 Promise 拒绝。最终补丁覆盖四处清理，等待其完成、处理清理自身的重复拒绝，仍将原始发布错误交给原有 SDK 错误分支。没有全局 unhandledrejection 屏蔽器，也不在测试中过滤 SDK 异常；升级 SDK 时须重新核对并更新/删除补丁，重跑生成器清理和真实断网验收。[SDK 参考](https://api-ref.agora.io/en/voice-sdk/web/4.x/interfaces/iagorartcclient.html)。

- 本地早期 `voice-rtc-network*`、`voice-rtc-reconnect-fixed` 的失败证据保留；仅修改连接恢复顺序没有解决 SDK 根因。
- Actions 34485871411 在服务切换前 frozen install 失败：本机 pnpm 10 与生产 pnpm 9 补丁哈希格式不兼容。已在全新目录以生产版本生成锁文件、完整冻结安装并比对 SDK 字节。
- Actions 34486608859 的 13 项语音功能通过，但存在一条 SDK 异常，流程失败并成功回滚。只读诊断 34487685131 确认生产安装包及浏览器 chunk 包含初版两处补丁，随后定位并补齐内层两处。相关证据位于 backend `evidence/voice-rtc-public-attempt2/`，最终成功证据独立保存。

## 回滚

遵循 `deploy/README.md`，使用当前发布的 nest-rollback.sh 和对应 SHA。保留数据库、密钥、.state、.backend 与版本兼容的游戏后端；不得恢复旧数据库或覆盖生产私密配置。
