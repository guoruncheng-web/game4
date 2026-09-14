# Social 炸弹与音频 v102

沿用游戏源码79c0c7eb94a13c677a32f5f749255c9c34474bd8和相同1256文件游戏树，后端固定0773aee8070261b1bdf89ff3a6c9ab6710ab41f4。

v101 Actions 34835053616首次27089ms、暖缓存3817ms，通过此前失败的刷新点。炸弹资源等待期间机器人和玩家超时托管继续合法运行，随后测试拿到12张手牌，却错误断言刚开局应为13张，故回滚。v102把开局手牌断言放在Match刚到达时；随后仍等待48帧炸弹与38个音效就绪，再检查完整对局/结算/音频/缓存。离线进局也明确等待炸弹和声音，未移除该验收。规则、玩法计时、资源与首次30秒预算不变。失败证据完整保留。

## 生产结果

生产frontend 34611379fcb458860b399bd651adf280a3fbc903，PWA v102。Actions [34835783262](https://github.com/guoruncheng-web/game4/actions/runs/34835783262) 全部成功，自动回滚未触发；鉴权/健康、Social专项和临时账号清理通过。未选择Thirteen/UMO/RTC长测不算本次通过。

GitHub runner公网：首次28351ms、暖缓存3881ms、离线2583ms；首次音频全加载45284ms，48帧炸弹资源和38音效就绪，可信音频18次启动，240个Social资源已缓存，完整结算返回和离线进局通过，脚本异常和资源错误0。公网SW v102、HTML与main脚本字节匹配候选。完整证据 evidence/social-bomb-v102/actions/ 和 public-integrity.json。

首次仍接近30秒预算，音频在页面就绪后继续加载，最低真机与长期音频听审没有由自动化替代。

Mac独立全新Chrome公网复核：首次27796ms、暖缓存2385ms、离线2337ms，可信音频19次，完整对局/结算/返回/离线进局通过，异常和资源错误0。evidence/social-bomb-v102/public-independent/result.json。
