# Thirteen Social 炸弹与音频 v100

发布入口 `/thirteen-social`。已认可的《一起开桌》BGM、37个操作音效与高清炸弹V2同步音轨接入；合法炸弹压制单/双2触发，非法或重复事件不触发。保留v99页面和本地机器人试玩范围。倒计时视频不在此次发布。

游戏源码：79c0c7eb94a13c677a32f5f749255c9c34474bd8。
后端固定：0773aee8070261b1bdf89ff3a6c9ab6710ab41f4，未修改。
前生产：bae9c09ad1254d5e38dfebd404cebd92e07869e6（v99）。
候选基线：3d18476a46b5cc88798f6b95a5cdeb8fbab8e4d9；PWA v100。

独立Creator3.8.8构建精确复制1256文件，树清单见 evidence/social-bomb-v100/build-manifest.json。TypeScript、规则/钱包/1000局、炸弹三类合法组合/非法/领牌/静音/降级/隐藏/切场通过。PWA lint/build/版本检查及完整对局、音频、缓存、离线通过，首次5420ms、缓存2406ms、离线2426ms，异常/资源错误0。详见 local-pwa/result.json。

炸弹按需加载48张512平方纹理、18fps、2.667秒，单实例约48MiB未压缩显存。最低真机性能尚未验证。生产Actions和公网结果在发布完成后补录。
