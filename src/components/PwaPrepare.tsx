'use client';

import { useEffect, useRef, useState } from 'react';
import { PREPARED_KEY, PREPARE_SKIP_KEY, PWA_VERSION } from '@/lib/pwa-version';

type Progress = { phase: string; done: number; total: number; bytes: number; totalBytes: number; failed: number };
type SwMessage = Partial<Progress> & { type?: string; version?: string; ready?: boolean };

/** 网络慢时不能把人一直挡在门外：这么久之后给出“先进入” */
const SKIP_AFTER_MS = 6000;
const EMPTY: Progress = { phase: 'idle', done: 0, total: 0, bytes: 0, totalBytes: 0, failed: 0 };

function mb(bytes: number) { return (bytes / 1048576).toFixed(1); }

function leave() {
  const root = document.documentElement;
  root.classList.add('gb-prepare-leaving');
  window.setTimeout(() => root.classList.remove('gb-preparing', 'gb-prepare-leaving', 'gb-prepare-update'), 450);
}

/**
 * “准备环境中”。标记始终由服务端渲染，是否显示只看 <html class="gb-preparing">
 * (由 layout 里的首屏脚本或更新刷新时的 PwaProvider 加上)。
 *
 * 首次进入首页：新 SW 快速激活后，这里通知它预缓存外壳资源，并展示逐项进度；
 * 老用户首次拿到新代码：新 SW 在 install 阶段自行预缓存，这里只接收进度。
 */
export default function PwaPrepare() {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [skippable, setSkippable] = useState(false);
  const [offline, setOffline] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('gb-preparing') || root.classList.contains('gb-prepare-update') || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;

    const finish = (source: MessageEventSource | null) => {
      if (finished.current) return;
      finished.current = true;
      try { localStorage.setItem(PREPARED_KEY, PWA_VERSION); } catch { /* 隐私模式记不住，下次再准备一遍 */ }
      // 页面本身已是新代码：新 SW 装好就请它接管；有其他旧标签页时 SW 会自己拒绝，避免旧页面丢 chunk。
      if (source instanceof ServiceWorker && source.state !== 'activated') source.postMessage({ type: 'gb-activate-if-alone' });
      leave();
    };
    const onMessage = (event: MessageEvent<SwMessage>) => {
      const data = event.data;
      if (!data || (data.type !== 'gb-precache' && data.type !== 'gb-status') || data.version !== PWA_VERSION) return;
      setProgress({ phase: data.phase ?? 'idle', done: data.done ?? 0, total: data.total ?? 0, bytes: data.bytes ?? 0, totalBytes: data.totalBytes ?? 0, failed: data.failed ?? 0 });
      if (data.ready || data.phase === 'done') finish(event.source);
    };
    container.addEventListener('message', onMessage);
    container.startMessages();

    const poll = async () => {
      if (finished.current) return;
      const registration = await container.getRegistration().catch(() => undefined);
      if (!registration) return;
      for (const worker of [registration.installing, registration.waiting, registration.active]) worker?.postMessage({ type: 'gb-status' });
      // 只有已激活、且没有新版本在安装的 SW 需要首页来发起预缓存；重复通知在 SW 里会合并成同一轮。
      if (registration.active && !registration.installing && !registration.waiting) registration.active.postMessage({ type: 'gb-precache-start' });
    };
    const updateOnline = () => {
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      if (isOffline) setSkippable(true);
    };
    const first = window.setTimeout(() => { updateOnline(); void poll(); }, 0);
    const timer = window.setInterval(() => void poll(), 1500);
    const skipTimer = window.setTimeout(() => setSkippable(true), SKIP_AFTER_MS);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.clearTimeout(skipTimer);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      container.removeEventListener('message', onMessage);
    };
  }, []);

  function skip() {
    try { sessionStorage.setItem(PREPARE_SKIP_KEY, PWA_VERSION); } catch { /* 忽略 */ }
    // 只收起遮罩，后台预缓存继续；完成后收到消息仍会记下“已准备”。
    leave();
  }

  const percent = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.bytes / progress.totalBytes) * 100)) : progress.phase === 'done' ? 100 : 0;
  const status = offline ? '网络不可用，恢复网络后会继续准备'
    : progress.totalBytes > 0 ? `已准备 ${mb(progress.bytes)} / ${mb(progress.totalBytes)} MB`
      : '正在连接…';

  return (
    <div className="gb-prepare" role="dialog" aria-modal="true" aria-labelledby="gb-prepare-title" aria-describedby="gb-prepare-status">
      <div className="gb-prepare-art" aria-hidden="true" />
      <div className="gb-prepare-panel">
        <h1 id="gb-prepare-title" className="gb-prepare-title"><span className="gb-prepare-first">准备环境中</span><span className="gb-prepare-update">正在切换新版本</span></h1>
        <p className="gb-prepare-sub gb-prepare-first">正在把游戏盒子装进你的手机<br />下次打开秒进，断网也能玩</p>
        <p className="gb-prepare-sub gb-prepare-update">新版本已经准备好，马上就好</p>
        <div className="gb-prepare-bar" role="progressbar" aria-label="准备进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="gb-prepare-fill" style={{ width: `${percent}%` }}><span className="gb-prepare-badge">{percent}%</span></div>
        </div>
        <p id="gb-prepare-status" className="gb-prepare-meta" aria-live="polite">{status}</p>
        {skippable && <button type="button" className="gb-prepare-skip" onClick={skip}>网络较慢？先进入 ›</button>}
      </div>
    </div>
  );
}
