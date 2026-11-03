'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Share, SquarePlus, X } from 'lucide-react';

/**
 * PWA 的客户端部分:注册 Service Worker、引导安装到桌面、提示版本更新。
 *
 * 三件事放在一个组件里,是因为它们共享同一份"当前是不是已经装好了"的判断 ——
 * 已经在独立窗口里跑的应用,既不该再劝安装,也不该被安装横幅挡住底部导航。
 */

/** 用户手动关掉横幅后,这么久之内不再打扰 */
const SNOOZE_DAYS = 14;
const DISMISS_KEY = 'game-box-install-dismissed-at';
const DEV_SW_CLEANUP_KEY = 'game-box-dev-sw-cleaned';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function standalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS 至今不支持 display-mode 媒体查询,只能读 Safari 自己的这个非标准字段
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function snoozed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < SNOOZE_DAYS * 864e5;
  } catch {
    return false;
  }
}

export default function PwaProvider() {
  const pathname = usePathname();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  /** iOS 不会派发 beforeinstallprompt,只能教用户走"分享 → 添加到主屏幕" */
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  // ------------------------------------------------------------ 注册 Service Worker
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // 开发模式不注册:dev 下的 chunk 每次编译都换名字,缓存它们只会让 HMR 拿到旧文件。
    // 仅仅 return 还不够:同一端口之前跑过 production 时,旧 SW 会继续控制 dev 页面，
    // 并从 game-box-assets-* 返回旧 Cocos 包。进入 dev 后主动注销并清掉本产品缓存；
    // 若当前页仍受旧 SW 控制，只刷新一次，让下一次导航真正脱离它。
    if (process.env.NODE_ENV !== 'production') {
      let disposed = false;
      void (async () => {
        const controlled = Boolean(navigator.serviceWorker.controller);
        const registrations = await navigator.serviceWorker.getRegistrations();
        const cacheNames = 'caches' in window ? await caches.keys() : [];
        await Promise.all([
          ...registrations.map((registration) => registration.unregister()),
          ...cacheNames
            .filter((name) => name.startsWith('game-box-'))
            .map((name) => caches.delete(name)),
        ]);
        if (disposed) return;
        if (!controlled) {
          sessionStorage.removeItem(DEV_SW_CLEANUP_KEY);
          return;
        }
        if (sessionStorage.getItem(DEV_SW_CLEANUP_KEY) !== '1') {
          sessionStorage.setItem(DEV_SW_CLEANUP_KEY, '1');
          window.location.reload();
        }
      })().catch(() => { /* 清理失败不阻断开发页面。 */ });
      return () => { disposed = true; };
    }

    let disposed = false;
    let timer = 0;
    let onVisible: (() => void) | null = null;

    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (disposed) return;
      // 已经有新版本装好在等着接管(上次访问时下载的)
      if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // controller 为空说明这是首次安装,不是更新,不用打扰用户
          if (next.state === 'installed' && navigator.serviceWorker.controller) setWaiting(next);
        });
      });

      /*
       * 主动去问有没有新版本。
       *
       * 浏览器只在**导航**的时候顺手检查 sw.js 变没变 —— 而装到桌面的 PWA
       * 常年开着同一个窗口、一次导航都不发生,不推它的话部署十次它也发现不了。
       * 所以两个时机各查一次:每小时一次,以及每次窗口重新回到前台。
       */
      const check = () => { void registration.update().catch(() => undefined); };
      timer = window.setInterval(check, 60 * 60_000);
      onVisible = () => { if (document.visibilityState === 'visible') check(); };
      document.addEventListener('visibilitychange', onVisible);
    }).catch(() => { /* 注册失败不影响游戏本身,静默 */ });

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // ------------------------------------------------------------ 安装时机
  useEffect(() => {
    if (standalone() || snoozed()) return;

    const onPrompt = (event: Event) => {
      // 不拦下来的话,浏览器会用自己的迷你横幅弹一次,时机和样式都不受控
      event.preventDefault();
      setInstall(event as InstallEvent);
      setHidden(false);
    };
    const onInstalled = () => { setInstall(null); setHidden(true); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) {
      // iOS 没有事件可等,延后几秒再出现:一进站就弹引导,人还没看清这是什么。
      // 两个 setState 都放进这个回调里,顺带避开"在 effect 体内同步 setState"那条规则。
      const timer = window.setTimeout(() => { setIos(true); setHidden(false); }, 4000);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onPrompt);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* 忽略 */ }
  }, []);

  const accept = useCallback(async () => {
    if (!install) return;
    await install.prompt();
    const { outcome } = await install.userChoice;
    setInstall(null);
    setHidden(true);
    // 拒绝过的人短期内不该被再问一次;同意的人横幅本来就不会再出现
    if (outcome === 'dismissed') dismiss();
  }, [install, dismiss]);

  const refresh = useCallback(() => {
    if (!waiting) return;
    // 新 SW 接管的那一刻再刷新,直接 reload 会拿到旧版本继续服务
    let done = false;
    const reload = () => {
      if (done) return;
      done = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    // 兜底:controllerchange 万一没来(SW 卡住、或它其实早就接管过了),
    // 也不能让用户点了按钮之后干等着 —— 2 秒后照样刷新
    window.setTimeout(reload, 2000);
    waiting.postMessage('skip-waiting');
    setWaiting(null);
  }, [waiting]);

  // 游戏页是全屏画布,底部弹任何东西都会挡住操作区,只在首页引导
  const home = pathname === '/';
  const showInstall = home && !hidden && (!!install || ios);

  if (!showInstall && !waiting) return null;

  return (
    <>
      {waiting && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-[calc(5.5rem+env(safe-area-inset-bottom))] flex w-[min(92vw,420px)] items-center gap-3 rounded-2xl border border-white bg-[#173366] px-4 py-3 text-white shadow-[0_10px_30px_rgba(23,51,102,0.35)]">
          <RefreshCw size={18} className="shrink-0" />
          <p className="flex-1 text-sm font-bold">有新版本可用</p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-black transition active:scale-95"
          >
            立即刷新
          </button>
        </div>
      )}

      {showInstall && (
        <div
          role="dialog"
          aria-label="安装到桌面"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto mb-[calc(5.5rem+env(safe-area-inset-bottom))] w-[min(92vw,420px)] rounded-3xl border border-white bg-white/95 p-4 shadow-[0_12px_36px_rgba(47,104,97,0.22)] backdrop-blur"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="关闭安装提示"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-slate-400 transition active:scale-90"
          >
            <X size={18} />
          </button>

          <div className="flex items-start gap-3 pr-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-2xl shadow-sm" />
            <div className="min-w-0">
              <p className="text-base font-black text-[#173366]">把游戏盒子装到桌面</p>
              <p className="mt-0.5 text-sm font-medium text-slate-500">
                像 App 一样一点即玩,玩过的游戏素材会留在本地,断网也能开。
              </p>
            </div>
          </div>

          {install ? (
            <button
              type="button"
              onClick={accept}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] text-base font-black text-white shadow-[0_6px_0_#22994b] transition active:translate-y-0.5 active:shadow-[0_3px_0_#22994b]"
            >
              <Download size={20} />
              安装到桌面
            </button>
          ) : (
            <p className="mt-4 flex flex-wrap items-center gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800">
              点底部的
              <Share size={17} className="text-emerald-600" aria-label="分享" />
              分享,再选
              <SquarePlus size={17} className="text-emerald-600" aria-label="添加到主屏幕" />
              「添加到主屏幕」
            </p>
          )}
        </div>
      )}
    </>
  );
}
