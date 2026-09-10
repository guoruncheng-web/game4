# PWA 顶部背景与安全区

按 20260910-130152.jpg 的顶部效果调整：背景延伸至状态栏，内容单独避让刘海。去除 html/body 的旧蓝色底色；首页根背景延续云朵头图，保留 viewport-fit=cover / black-translucent，首页上内边距从 22px 缩为 8px，装饰图单独避让安全区以免纵向拉伸。未隐藏系统时间或电量，未更改游戏构建和后端固定修订。

本地 lint、生产构建、10 项部署范围测试、actionlint 通过。Chrome 393×852、顶部安全区 0/59px 验证：header.y 均为 0，头像内容 y 为 8/67px，没有根容器重复预留。语聊、消息、我的标签根容器均从 y=0 开始。证据位于 evidence/top-inset。测试为未登录布局检查，截图不代表真实 iOS 状态栏或鉴权验收；安装后的 iOS 系统绘制仍需真机确认，旧安装保留旧状态栏配置时可能需要重新添加主屏幕。

缓存 v86。共享样式选择基础鉴权、Thirteen/UMO PWA 音频离线与 RTC 验收；游戏权威规则长测不在本次 CSS 影响范围内。生产结果以本次 Actions 为准。

顶部修复生产提交 52b69ff9f3b97d4f9779c12e020451f1f219ce6b，Actions 34491260325 全部所选检查成功：https://github.com/guoruncheng-web/game4/actions/runs/34491260325 。

用户真机反馈 v86 背景仍未延伸到状态栏。随后核对公网原始 HTML：Next 配置 appleWebApp.capable=true 只生成 mobile-web-app-capable=yes，没有 apple-mobile-web-app-capable=yes。v88 用 metadata.other 显式补入 Apple 兼容标签。Apple 文档说明状态栏样式以前述全屏配置为前置：https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html 。这说明配置有缺项，但不能据此认定全部 iOS 版本都已修复；WebKit 也有 iOS 26.1+ 状态栏覆盖回归记录 https://bugs.webkit.org/show_bug.cgi?id=301994 。最终沉浸效果仍等待用户设备/iOS 版本确认，不把 Chrome safe-area 模拟算作 iOS 实测。
