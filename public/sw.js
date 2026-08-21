/**
 * 游戏盒子的 Service Worker。
 *
 * 手写而不是用 next-pwa / workbox:这个站点的缓存需求就两条 ——
 * 壳要能离线打开、玩过的游戏素材别再下第二遍 —— 一个 workbox 运行时(约 20KB)
 * 比这份文件本身还大,而且它对 Turbopack 的支持一直是滞后的。
 *
 * 三条缓存策略,按请求类型分流:
 *
 * 1. 导航请求(点开一个页面)  network-first。游戏经常改,不能让人打开就是旧版;
 *    离线时回落到缓存,再没有就给 /offline 那张兜底页。
 * 2. /_next/static/**          cache-first。文件名带内容哈希,内容永不变,回源纯属浪费。
 * 3. 游戏素材(图片/模型/音频) cache-first。这是"缓存游戏素材"的主体:
 *    玩过一次就留在本地,第二次进游戏不再下 —— 霓虹突击一局要拉的 glb 和特效图
 *    接近 2MB,水果切切乐的贴图更大,移动网络下这一条最值钱。
 *
 * 素材是**玩过才缓存**,不是安装时全量预下载:盒子里所有素材加起来 60MB 以上,
 * 装个桌面图标就替用户吃掉这么多流量是不礼貌的。
 */

const VERSION = 'v21';
const SHELL_CACHE = `game-box-shell-${VERSION}`;
const STATIC_CACHE = `game-box-static-${VERSION}`;
const ASSET_CACHE = `game-box-assets-${VERSION}`;
const KEEP = [SHELL_CACHE, STATIC_CACHE, ASSET_CACHE];

/** 安装时只预取这几样:兜底页和图标,加起来几十 KB */
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png'];

/** 游戏素材的判定:这些目录下的位图、模型、音频 */
const ASSET_DIRS = ['/neon-strike/', '/neon-strike-2d/', '/fruit-slasher/', '/eight-ball/', '/triple-pile/', '/fish-hunter/', '/ludo/', '/assets/', '/icons/', '/concepts/'];
const ASSET_EXT = /\.(png|jpe?g|webp|avif|gif|svg|glb|gltf|bin|ktx2|hdr|wav|mp3|ogg|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 单个资源 404 不该让整次安装失败,逐个来
    await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
  })());
  /*
   * 这里**故意不调 skipWaiting()**。装好之后就老实停在 waiting,等页面上的用户
   * 点了"立即刷新"再由下面那条 message 放行。
   *
   * 在 install 里 skipWaiting 会有两个后果:
   * 1. registration.waiting 永远是空的,PwaProvider 的更新横幅等于摆设;
   *    而且它靠 controllerchange 触发 reload —— 事件早就发生完了,点刷新不会有反应。
   * 2. 新 SW 会抢在旧页面还开着的时候接管。旧页面接着去要旧的 _next/static chunk,
   *    新 VERSION 的 cache 是空的、服务器上那个 chunk 又随新部署删了,页面当场碎掉。
   */
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => !KEEP.includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/** 页面在更新提示里点了"立即刷新"时发过来 */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isAsset(url) {
  return ASSET_EXT.test(url.pathname) && ASSET_DIRS.some((dir) => url.pathname.startsWith(dir));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // 只存成功的完整响应:206(range)和不透明响应存进去会在下次取出时坏掉
  if (response.ok && response.status === 200) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    /*
     * 被重定向过的响应一律不存。未登录访问 /star-runner 会被 middleware 302 到首页,
     * fetch 默认跟随重定向,存进去就等于把首页的 HTML 挂在 /star-runner 这个键上 ——
     * 之后离线打开游戏页会看到首页。而且 redirected 的响应再拿去应答导航请求,
     * 浏览器本身就会报错(redirect mode 不是 follow)。
     */
    if (response.ok && !response.redirected) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    const offline = await cache.match('/offline');
    if (offline) return offline;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // 只管自己域下的 GET;POST 和跨域(CDN、统计)一律放行
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Next 的 RSC / 数据请求带这个头,缓存它会让路由拿到过期的 payload
  if (request.headers.get('RSC') === '1') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
