'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

type Props = {
  src: string;
  title: string;
  gameId?: 'umo';
  readyOnLoad?: boolean;
  loadingText?: string;
  showLoadingOverlay?: boolean;
};

/**
 * Cocos 游戏使用同源 iframe，避免把 Creator 的 SystemJS/WebGL 生命周期塞进 React 树。
 * 会话只传公开玩家资料；httpOnly Cookie 仍由浏览器在 /ws 握手时自行携带。
 */
export default function CocosCanvas({
  src,
  title,
  gameId = 'umo',
  readyOnLoad = false,
  loadingText = '正在摆好牌桌…',
  showLoadingOverlay = true,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    function sendSession() {
      iframe?.contentWindow?.postMessage({
        source: 'game4',
        type: 'game4:session',
        version: 1,
        locale: navigator.language,
        user: user ? { id: user.username, displayName: user.username } : null,
        returnPath: '/',
      }, window.location.origin);
    }

    function onMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || event.source !== iframe?.contentWindow) return;
      const value = event.data as { source?: string; type?: string; version?: number } | null;
      if (!value || value.source !== gameId || value.version !== 1) return;
      if (value.type === `${gameId}:ready`) {
        setReady(true);
        sendSession();
      } else if (value.type === `${gameId}:exit`) {
        router.push('/');
      }
    }

    window.addEventListener('message', onMessage);
    if (ready) sendSession();
    return () => window.removeEventListener('message', onMessage);
  }, [gameId, ready, router, user]);

  return (
    <div className="relative size-full overflow-hidden bg-[#040816]">
      {showLoadingOverlay && !ready && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[#040816] text-lg font-bold text-amber-200">
          {loadingText}
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen"
        className="block size-full border-0"
        onLoad={() => { if (readyOnLoad) setReady(true); }}
      />
    </div>
  );
}
