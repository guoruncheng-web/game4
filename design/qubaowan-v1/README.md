# 趣宝玩品牌 v1

正式游戏盒子名称：趣宝玩。用途：PWA 安装、iOS 主屏、Android 自适应图标、浏览器 favicon 和登录页品牌标识。

由内置 image_gen 生成，参考 `design/pwa-v5/01-main-pages.png` 的绿色方宝和糖果玩具视觉。母版：`public/icons/qubaowan-master-v1.png`。运行 `pnpm icons` 可重现 192/512 PNG、180 Apple 图标、带 64px 安全留边的 512 maskable 和 RGBA PNG 编码的 favicon.ico。

图标使用独立 qubaowan-v1 文件名，避免命中旧图标的 cache-first URL；SW 预缓存引用随之更新，缓存策略与游戏资源保持原样。PWA id、scope、start_url 保留，延续现有应用身份。

注册页复用同套登录插画，避免展示原注册插画中烘焙的 GAME BOX 招牌。原始概念图与旧图标保留作为来源记录。

生成提示词：

```text
Use case: logo-brand. Create a production square PWA app icon for the Chinese casual social game collection 趣宝玩. Reference: the green rounded cube mascot and polished candy toy style of the provided app concept board. Generate ONE icon only, not a board or mockup. A lovable lime-green rounded cube creature, two dark oval eyes and tiny happy mouth, wearing chunky blue-violet headphones, holding a small violet game controller with a simple pale D-pad and two coral buttons. Premium soft 3D toy rendering, clear bold silhouette, gentle studio light, restrained highlights, no tiny decorations. Full-bleed solid pale peach-pink background #fff5f7, opaque square edges, no rounded outer tile, no border. Entire mascot including headphones and controller must fit inside the central 70 percent of the square so Android circular masking is safe. Large readable face, centered compact composition. No text, letters, watermark, floating stars or extra objects. 1024x1024.
```

此变更为本地实现，尚未生产发布。操作系统上已安装应用的名称与图标更新仍待发布后真机核验。

验证：`pnpm lint`、`pnpm build`、`git diff --check` 通过；构建后的 manifest 名称/身份、PNG 尺寸、首页 title 与 Apple 安装名称断言通过。构建保留既有 middleware 弃用提示。未执行生产发布或真机安装。
