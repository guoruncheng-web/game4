'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { withGameCredentials } from '@/lib/api-client';

type Props = {
  src: string;
  title: string;
  gameId?: 'umo' | 'thirteen';
  readyOnLoad?: boolean;
  backdropClassName?: string;
  loadingText?: string;
  showLoadingOverlay?: boolean;
  interactiveScenes?: readonly string[];
  children?: ReactNode;
};

/**
 * Cocos 游戏使用同源 iframe，避免把 Creator 的 SystemJS/WebGL 生命周期塞进 React 树。
 * Cocos 通过同源 API 查询公开玩家资料；httpOnly Cookie 仍只由浏览器携带。
 */
export default function CocosCanvas({
  src,
  title,
  gameId = 'umo',
  readyOnLoad = false,
  backdropClassName = 'bg-[#040816]',
  loadingText = '正在摆好牌桌…',
  showLoadingOverlay = true,
  interactiveScenes,
  children,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, credentials } = useAuth();
  const router = useRouter();
  const gameSrc = useMemo(() => {
    const authenticated = withGameCredentials(src, credentials);
    if (!credentials || gameId !== 'umo' || typeof window === 'undefined') return authenticated;
    const pageUrl = new URL(authenticated, window.location.origin);
    const socketUrl = new URL('/ws', window.location.origin);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.searchParams.set('game', 'umo');
    socketUrl.searchParams.set('uid', String(credentials.uid));
    socketUrl.searchParams.set('token', credentials.token);
    pageUrl.searchParams.set('umoWs', socketUrl.toString());
    return `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`;
  }, [credentials, gameId, src]);
  const [readiness, setReadiness] = useState({ source: gameSrc, ready: false });
  const ready = readiness.source === gameSrc && readiness.ready;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    function sendThirteenSession() {
      if (gameId !== 'thirteen') return;
      iframe?.contentWindow?.postMessage({
        source: 'game4',
        type: 'game4:session',
        version: 1,
        locale: 'zh-CN',
        user: user && credentials ? {
          id: String(user.uid), uid: user.uid, displayName: user.username, token: credentials.token,
        } : null,
        returnPath: '/',
      }, window.location.origin);
    }

    function onMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || event.source !== iframe?.contentWindow) return;
      const value = event.data as {
        source?: string; type?: string; version?: number; scene?: string; phase?: string;
        wallet?: { diamonds?: unknown; chips?: unknown; reserved?: unknown; totalChips?: unknown };
      } | null;
      if (!value || value.source !== gameId || value.version !== 1) return;
      if (value.type === `${gameId}:ready`) {
        sendThirteenSession();
        if (!interactiveScenes) setReadiness({ source: gameSrc, ready: true });
      } else if (value.type === `${gameId}:scene` && interactiveScenes) {
        const interactive = value.phase === 'ready'
          && typeof value.scene === 'string'
          && interactiveScenes.includes(value.scene);
        setReadiness({ source: gameSrc, ready: interactive });
      } else if (value.type === `${gameId}:exit`) {
        router.push('/');
      } else if (gameId === 'thirteen' && value.type === 'thirteen:wallet-updated') {
        const wallet = value.wallet;
        if (!wallet || !Number.isSafeInteger(wallet.diamonds) || Number(wallet.diamonds) < 0
          || !Number.isSafeInteger(wallet.chips) || Number(wallet.chips) < 0
          || !Number.isSafeInteger(wallet.reserved) || Number(wallet.reserved) < 0
          || !Number.isSafeInteger(wallet.totalChips) || Number(wallet.totalChips) < 0) return;
        window.dispatchEvent(new CustomEvent('game4:wallet-updated', { detail: wallet }));
      }
    }

    window.addEventListener('message', onMessage);
    if (ready) sendThirteenSession();
    return () => window.removeEventListener('message', onMessage);
  }, [credentials, gameId, gameSrc, interactiveScenes, ready, router, user]);

  return (
    <div className={`relative size-full overflow-hidden ${backdropClassName}`}>
      {showLoadingOverlay && !ready && (
        <div className={`absolute inset-0 z-10 grid place-items-center text-lg font-bold text-amber-200 ${backdropClassName}`}>
          {loadingText}
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={gameSrc}
        title={title}
        allow="autoplay; fullscreen"
        referrerPolicy="no-referrer"
        className="block size-full border-0"
        onLoad={() => setReadiness({ source: gameSrc, ready: readyOnLoad })}
      />
      {ready && children}
    </div>
  );
}
