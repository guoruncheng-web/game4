# 房间 RTC 语音接入

生产前端基线 cb59d8713257d1cb515b65c3287ad9b74886f285，后端基线 e1f62d48fcb7edb221fd2975dba51ffbfe0ec2c6。只接声网 RTC；房间和文字消息仍由原 HTTP API 管理，不引入 RTM。

使用 agora-rtc-sdk-ng 4.24.8，点击加入语音后才动态加载 SDK、申请成员 Token 并以听众身份加入频道。申请上麦及管理员审批沿用后端；用户需要主动开启麦克风才能发言。关闭麦克风、下麦、禁麦、离房、关闭房间、登出、页面退出或鉴权失败时停止采集。恢复网络或重新连接后只恢复收听，不自动开麦。游戏 iframe 打开期间外层房间会话保持。

使用 AEC/ANS/AGC 与 speech_standard 音频配置，不采集摄像头；自动播放受限时显示提示并提供“播放声音”操作。SDK 票据、客户端和音轨不写入日志、全局变量或存储。浏览器测试的只读探针只记录音轨生命周期、音频字节和票据请求次数。

后端票据按真实用户 UID/房间/麦位权限签发，并限定为 min(配置有效期, 120 秒, 平台登录剩余时间)。正常客户端每 30 秒重新向网关鉴权续期，房间权限仍每 4 秒同步。声网媒体连接独立于平台票据，已签出的票据不能仅靠平台登出立即撤回：修改过的客户端可能保留至最多 120 秒的旧媒体权限；正式客户端收到权限变更立即关闭音轨。未实现服务端声网踢人 REST 管理，不把该边界描述为瞬时撤权。

本地：前端 lint、生产构建；11 项音频会话/SDK 清理测试（包括权限拒绝/晚返回/撤权/重连清理）、9 项按需部署规则测试；后端 lint、20 项单测、五服务构建通过。独立本地 gateway 17100 + voice 17104 复用平台服务；双端 Chrome 走真实页面、网关、数据库和声网，使用合成麦克风音频，不读取真实环境声音。

双端证据在对应 backend 的 evidence/voice-rtc-*：真实音频字节、双向发言、管理员审批/禁麦、游戏弹窗期间通话、续期、重新连接、房间关闭与账号清理。每轮断网恢复结果均单独保存，不把失败轮次计为通过。此文不宣称 iOS/Android 真机、后台锁屏、蓝牙耳机或真实麦克风声学质量已验收。

正式发布使用 PWA v85。按需部署会保留基础鉴权/健康检查及本次双端 RTC 验收，未受影响的游戏浏览器套件显示 skipped；这不表示这些套件在本次重新通过。最终上线状态以 Actions 和公网证据为准。

SDK 参考：https://api-ref.agora.io/en/voice-sdk/web/4.x/interfaces/iagorartcclient.html

断网验收记录：voice-rtc-network 的功能断言通过但出现两条只有概要的未处理 Promise 异常，因此该轮记为失败；补充脱敏堆栈后 voice-rtc-network-diagnostic 完整通过且 browserErrors 为空。原始失败证据保留，不把一次后续通过解释为已定位根因；连续断网复验另记。

连续三次断网的 voice-rtc-network-repeat 复现了 SDK 的 WS_ABORT（publish）未处理异常。恢复逻辑改为结束旧 SDK 会话后重新建立听众连接，避免旧连接自动恢复发布；voice-rtc-reconnect-fixed 保存该改动的真实双端复验。voice-rtc-fresh-reconnect 在登录前被本地来源校验拒绝，因为重新构建未带候选网关地址；核对并修正构建期 rewrites 后复验，未放宽 Origin 检查。

SDK 根因与补丁：上述 fresh-session 恢复调整后 voice-rtc-reconnect-fixed 仍失败，未将其当作修复成功。检查 4.24.8 的默认导出 AgoraRTC_N-production.js，发现 _publishHighStream 两条异常路径调用 async generator.throw(error) 却未 await；应用层捕获 publish() 不能捕获该分离 Promise。pnpm 的 patches/agora-rtc-sdk-ng@4.24.8.patch 仅在这两处等待生成器清理并消费清理自身的重复拒绝，仍重新抛出原始发布错误供 SDK 原有分支处理。版本、补丁哈希和 lockfile 同步固定；test/voice/sdk-patch.test.mjs 执行补丁中的实际表达式，断言清理完成且原始异常保留。未安装全局 unhandledrejection 屏蔽器，也不从验收中过滤 SDK 异常。升级 SDK 时必须重新核对上游实现、删除或更新补丁并重跑断网用例。

最终本地生产复验：evidence/voice-rtc-sdk-patched/result.json 的 passed=true、13 项功能断言通过、browserErrors=[]、accountsCleaned=true，进程退出码 0。使用实际声网网络和合成音频，包含连续三次在开麦过程中断网的压力场景；先前失败证据原样保留。

发布固定后端：6bef8f412a5113bf1bf518359e50cec9a2775b7a。

首轮 Actions 34485871411 在切换前的 frozen install 失败，原因为本机 pnpm 10 补丁哈希与生产 pnpm 9.15.9 不兼容。已在全新临时目录用 pnpm 9.15.9 重建锁文件并通过完整冻结安装，固定 packageManager=pnpm@9.15.9；SDK 补丁及依赖版本未变。原流水线状态为 failure，未部署该候选。

公网第二轮 Actions 34486608859 的 13 项语音功能均通过，但断网时仍有 1 条 WS_ABORT 未处理异常，因此该轮失败并已成功回滚，不能称为上线成功。只读诊断 Actions 34487685131 确認失败构建的安装包及浏览器 chunk 均包含初版两处补丁；继续检查发现内层 doPublish 和备用媒体发布路径还各有一次未等待的 generator.throw。最终补丁覆盖外层两处 await 与内层两处 yield 清理，新增测试执行两处真实补丁表达式；无全局异常屏蔽。voice-rtc-nested-cleanup 保存连续八次断网的复验。

四处补丁最终本地结果：voice-rtc-nested-cleanup/result.json 的 18 项断言通过（含连续八次断网）、browserErrors=[]、accountsCleaned=true，退出码 0。前端 11 项语音/SDK 测试与 9 项部署选择测试、lint、pnpm 9.15.9 冻结安装和生产构建通过。

完整清理补丁发布固定后端：dd3a27da774a8e171da98532a1a6d33ef2294cb9（新增压力轮数参数和脱敏异常输出，业务代码同 6bef8f4）。
