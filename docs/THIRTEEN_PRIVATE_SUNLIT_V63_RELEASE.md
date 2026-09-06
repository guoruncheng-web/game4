# Thirteen 私人房晴光 v63

用户明确授权“私人房重构，弄完就验收部署上线”。源提交 9dc05ff513204fe1ae6025fab1132649d71245f1，Thirteen feat/modern-doudizhu-ui。复用已上线晴光美术，重构原生私人房输入、复制、四席准备/开局和离线状态；修正私人房连接中误显示匹配页，补齐字母数字房码字体。

Creator 3.8.8 release Main 5066c4ee-d702-4879-8ddb-a69b5836eb08；RC5 626 文件，22836705 bytes，全树 `d89045f0a59e40c7774895a7cd1762bbe4fd7467f2a0496444a5881e23b1af97`。public/thirteen/game 与候选逐字节相同。缓存 v63、iframe private-sunlit-v1-rc5。

本地验收：严格 assets 类型检查、138/138 源码测试、宿主 lint/build/Thirteen 协议；852×393 全新 PWA 在线/离线大厅、匹配及私人房，可信音频；真实两浏览器+两 WS 席位创建/加入/原生键盘输入/准备切换/四席开局通过，临时账号全部删除。诊断布局另覆盖 1672×941、667×375、2400×1080。

发布前 HEAD 67dd3eeaa46f8b24c15c7498e26db5d5e119fd4e。回滚 revert 本发布提交并同步更新 SW，通过原 Actions 恢复完整 Web/宿主单元；备份 /Users/mac/projects/.codex-tmp/thirteen-private-sunlit-v1-host-before。沿用已获授权的跨地域冷启动风险，性能豁免不等于性能通过；不豁免功能/音频/PWA/健康。

Actions 与公网最终结果在源仓 docs/R03_PRIVATE_SUNLIT_V1.md、evidence/release/2026-09-06-private-sunlit-v63 留存，避免事后文档重复触发部署。生成 Web 与原始验收日志保留上游空白，手写文件 diff --check 单独通过。
