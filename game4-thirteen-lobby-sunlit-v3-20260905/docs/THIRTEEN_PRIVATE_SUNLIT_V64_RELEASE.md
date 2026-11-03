# 私人房晴光 v64 提示行补丁

继续用户已授权的私人房重构验收上线任务。源提交 bbbc74b5f613e88efebfb51bbc00cb54672b09c2。错误与慢连接提示改用面板内状态行，暂时隐藏常规等待文案，避免窄屏贴住创建按钮；状态恢复后常规信息重新显示。

RC6 Creator 3.8.8 release，626 文件，22836887 bytes，树 `75b4378b94db3db39e04a479b168d535aa50cf55114e8365c5258d412cc932f2`，宿主完全一致。缓存 v64 与 iframe private-sunlit-v1-rc6 同步。严格检查、138 测试、运行时布局/错误行断言、宿主 lint/build、localhost:3000 全新 PWA 匹配/私人房/音频/缓存/离线全部通过。真实 RC5 四席流程与最终公网复验见源仓 docs/R03_PRIVATE_SUNLIT_V1.md。

基线20d38741414d324f0dcc11ca893e1206044142d7（v63 Actions34033094552成功），沿用v63发布授权及已知性能风险。回滚revert本提交并更新缓存版本，通过相同Actions部署完整单元；更早旧界面基线67dd3ee。最终公网证据在源仓 evidence/release/2026-09-06-private-sunlit-v64。
