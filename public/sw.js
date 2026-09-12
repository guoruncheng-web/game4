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

const VERSION = 'v92';
const SHELL_CACHE = `game-box-shell-${VERSION}`;
const STATIC_CACHE = `game-box-static-${VERSION}`;
const ASSET_CACHE = `game-box-assets-${VERSION}`;
const KEEP = [SHELL_CACHE, STATIC_CACHE, ASSET_CACHE];

/** 安装时只预取这几样:兜底页和图标,加起来几十 KB */
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png'];

/** 游戏素材的判定:这些目录下的位图、模型、音频 */
const ASSET_DIRS = ['/neon-strike/', '/neon-strike-2d/', '/fruit-slasher/', '/eight-ball/', '/triple-pile/', '/fish-hunter/', '/ludo/', '/umo/', '/thirteen/', '/thirteen-social/', '/assets/', '/icons/', '/concepts/'];
const ASSET_EXT = /\.(js|json|css|wasm|png|jpe?g|webp|avif|gif|svg|glb|gltf|bin|ktx2|hdr|wav|mp3|m4a|aac|ogg|ttf|woff2?)$/i;

/** 外壳预缓存清单:构建后由 tools/pwa/build-precache-manifest.mjs 生成(Next 产物 + 页面引用的界面图) */
const PRECACHE_MANIFEST = '/pwa-precache.json';
/** 预缓存完成标记,按版本区分;首页据此判断"环境已准备好" */
const PREPARED_MARKER = `/__gb-prepared-${VERSION}`;
const PRECACHE_CONCURRENCY = 6;

let progress = { phase: 'idle', done: 0, total: 0, bytes: 0, totalBytes: 0, failed: 0 };
let running = null;
let lastReport = 0;

/** 进度发给所有窗口(包括尚未受控的首次访问页),150ms 节流 */
async function report(force) {
  const now = Date.now();
  if (!force && now - lastReport < 150) return;
  lastReport = now;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: 'gb-precache', version: VERSION, ...progress });
}

async function prepared() {
  return Boolean(await caches.match(PREPARED_MARKER));
}

/*
 * 预缓存外壳需要的全部资源并逐项汇报进度。
 * 单个文件失败只记数不中断:宁可少缓存一张图,也不能让新版本永远装不上。
 * 带哈希的 _next/static 文件内容永不变,直接复用旧版本缓存里的同一份,更新时只下真正变了的 chunk。
 */
async function precacheAll() {
  if (await prepared()) {
    progress = { ...progress, phase: 'done' };
    await report(true);
    return;
  }
  progress = { phase: 'running', done: 0, total: 0, bytes: 0, totalBytes: 0, failed: 0 };
  await report(true);
  let files = [];
  try {
    const response = await fetch(PRECACHE_MANIFEST, { cache: 'no-store' });
    if (response.ok) files = (await response.json()).files ?? [];
  } catch { /* 清单拿不到就只写完成标记,外壳仍按运行时策略边用边缓存 */ }
  progress.total = files.length;
  progress.totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  await report(true);
  const staticCache = await caches.open(STATIC_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const hashed = file.url.startsWith('/_next/static/');
      const cache = hashed ? staticCache : assetCache;
      try {
        if (!(await cache.match(file.url))) {
          const reused = hashed ? await caches.match(file.url) : undefined;
          const response = reused ?? await fetch(file.url, { cache: 'no-cache' });
          if (response.ok && response.status === 200) await cache.put(file.url, response);
          else progress.failed += 1;
        }
      } catch {
        progress.failed += 1;
      }
      progress.done += 1;
      progress.bytes += file.size || 0;
      void report(false);
    }
  };
  await Promise.all(Array.from({ length: PRECACHE_CONCURRENCY }, worker));
  const shell = await caches.open(SHELL_CACHE);
  // 首页 HTML 也存一份:准备完后断网从桌面图标打开仍能进首页。导航依旧 network-first,联网时总拿最新。
  try {
    const home = await fetch('/', { cache: 'no-cache', credentials: 'same-origin' });
    if (home.ok && !home.redirected) await shell.put('/', home);
  } catch { /* 拿不到就等下次在线打开首页时由 networkFirst 补上 */ }
  await shell.put(PREPARED_MARKER, new Response(JSON.stringify({ failed: progress.failed, at: Date.now() }), { headers: { 'content-type': 'application/json' } }));
  progress.phase = 'done';
  await report(true);
}

/** 首页轮询会重复发起,合并成同一轮 */
function precacheOnce() {
  running ??= precacheAll().finally(() => { running = null; });
  return running;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 单个资源 404 不该让整次安装失败,逐个来
    await Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})));
    /*
     * 已有旧版本在跑(即"更新"):先把新版本外壳全部下好再进入 waiting,
     * 用户点"立即刷新"时资源都已在本地,不再对着空白页等网络。
     * 首次安装保持原来的快速激活,由首页的"准备环境中"在激活后发起预缓存(见 message),
     * 这样直接打开游戏页(含公网验收)的首次接管时序不受影响。
     */
    if (self.registration.active) await precacheOnce();
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

self.addEventListener('message', (event) => {
  /** 页面在更新提示里点了"立即刷新"时发过来 */
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
    return;
  }
  const type = event.data && event.data.type;
  /** 首页"准备环境中"请已激活的 SW 预缓存外壳 */
  if (type === 'gb-precache-start') {
    event.waitUntil(precacheOnce());
    return;
  }
  /** 已是新代码的页面准备完毕:只有它一个窗口时才接管,避免还开着的旧页面拿不到旧 chunk */
  if (type === 'gb-activate-if-alone') {
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      if (windows.length <= 1) return self.skipWaiting();
      return undefined;
    }));
    return;
  }
  /** 查询版本与准备状态;带 MessageChannel 时回到端口,否则回给发送方 */
  if (type === 'gb-status') {
    event.waitUntil(prepared().then((ready) => {
      const reply = { type: 'gb-status', version: VERSION, ...progress, ready, phase: ready ? 'done' : progress.phase };
      const target = (event.ports && event.ports[0]) || event.source;
      if (target) target.postMessage(reply);
    }));
  }
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
  const cacheUrl = new URL(request.url);
  // 游戏链接必须携带 uid/token，但 Cache Storage 不能长期保存凭据字符串。
  cacheUrl.searchParams.delete('uid');
  cacheUrl.searchParams.delete('token');
  cacheUrl.searchParams.delete('umoWs');
  const cacheKey = cacheUrl.toString();
  try {
    const response = await fetch(request);
    /*
     * 被重定向过的响应一律不存。未登录访问 /star-runner 会被 middleware 302 到首页,
     * fetch 默认跟随重定向,存进去就等于把首页的 HTML 挂在 /star-runner 这个键上 ——
     * 之后离线打开游戏页会看到首页。而且 redirected 的响应再拿去应答导航请求,
     * 浏览器本身就会报错(redirect mode 不是 follow)。
     */
    if (response.ok && !response.redirected) cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(cacheKey);
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
