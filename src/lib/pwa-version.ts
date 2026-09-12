/**
 * PWA 缓存版本。必须与 public/sw.js 的 VERSION、部署验收里的 PWA_CACHE_VERSION 保持一致，
 * test/pwa/pwa-version.test.mjs 会校验三处。
 */
export const PWA_VERSION = 'v92';

/** 已完成“准备环境中”的版本；与 PWA_VERSION 不同时首页会重新准备。 */
export const PREPARED_KEY = 'game-box-prepared-version';

/** 本次会话里用户点了“先进入”的版本，同一会话内刷新不再遮挡。 */
export const PREPARE_SKIP_KEY = 'game-box-prepare-skipped';

/**
 * 首屏前同步执行的判断：只在首页、顶层窗口、支持 SW 且尚未准备过当前版本时打开准备页。
 * 放在 <head> 里，HTML 一到就显示准备页，不等 JS 下载完。
 */
export const PREPARE_BOOT_SCRIPT = `(function(){try{var v=${JSON.stringify(PWA_VERSION)};if(location.pathname!=='/'||window.self!==window.top||!('serviceWorker' in navigator))return;if(localStorage.getItem(${JSON.stringify(PREPARED_KEY)})===v||sessionStorage.getItem(${JSON.stringify(PREPARE_SKIP_KEY)})===v)return;document.documentElement.classList.add('gb-preparing')}catch(e){}})();`;
