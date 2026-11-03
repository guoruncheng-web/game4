'use client';

import { UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { apiFetch } from '@/lib/api-client';
import Avatar from './Avatar';

type FriendRequest = {
  id: number;
  sender: { id: number; uid: number; username: string; avatar: string; avatarUrl?: string | null };
};

/** 全站好友申请横幅。PWA 页面仍存活时，每 5 秒检查一次新申请。 */
export default function FriendRequestBanner() {
  const { user } = useAuth();
  const router = useRouter();
  const [request, setRequest] = useState<FriendRequest | null>(null);
  const dismissedRef = useRef(new Set<number>());

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function poll() {
      try {
        const response = await apiFetch('/api/friend-requests');
        const data = await response.json();
        if (cancelled || !response.ok) return;
        const next = (data.requests as FriendRequest[]).find((item) => !dismissedRef.current.has(item.id));
        setRequest(next ?? null);
      } catch {
        // 横幅是增强体验，短暂断网不影响其他页面。
      }
    }
    const initial = window.setTimeout(() => { void poll(); }, 800);
    const interval = window.setInterval(() => { void poll(); }, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [user]);

  if (!request) return null;

  function openRequests() {
    window.dispatchEvent(new CustomEvent('game-box-open-messages'));
    router.push('/?tab=messages');
    setRequest(null);
  }

  return (
    <aside className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] mx-auto flex max-w-[450px] items-center gap-3 rounded-2xl border-2 border-white bg-[#fffdf7]/95 p-3 shadow-[0_12px_40px_rgba(23,51,102,0.22)] backdrop-blur-xl" role="status">
      <button type="button" onClick={openRequests} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar emoji={request.sender.avatar} url={request.sender.avatarUrl} className="size-11 rounded-xl bg-emerald-50 text-2xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-[#173366]">{request.sender.username} 请求添加你为好友</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-emerald-600"><UserPlus size={13} /> 点击前往消息列表</span>
        </span>
      </button>
      <button
        type="button"
        aria-label="暂时关闭好友申请通知"
        onClick={() => {
          dismissedRef.current.add(request.id);
          setRequest(null);
        }}
        className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400"
      >
        <X size={18} />
      </button>
    </aside>
  );
}
