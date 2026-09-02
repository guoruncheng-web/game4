'use client';

import { ArrowLeft, MessageCircle, Plus, Search, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useCoop } from './CoopProvider';
import { apiFetch } from '@/lib/api-client';
import Avatar from './Avatar';

type Friend = {
  id: number;
  uid: number;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
};
type SearchUser = Friend & { isFriend: boolean; requestSent: boolean; requestReceived: boolean };
type FriendRequest = { id: number; createdAt: string; sender: Friend };
type Message = {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string;
  mine: boolean;
};

export default function ChatPanel() {
  const { user, openPanel } = useAuth();
  const { online, connected } = useCoop();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const onlineIds = new Set(online.map((person) => person.id));

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const res = await apiFetch('/api/friends');
    const data = await res.json();
    if (res.ok) setFriends(data.friends);
  }, [user]);

  const loadMessages = useCallback(async (friendId: number, quiet = false) => {
    const res = await apiFetch(`/api/messages?friendId=${friendId}`);
    const data = await res.json();
    if (res.ok) setMessages(data.messages);
    else if (!quiet) setError(data.error ?? '消息加载失败');
  }, []);

  const loadRequests = useCallback(async () => {
    if (!user) return;
    const res = await apiFetch('/api/friend-requests');
    const data = await res.json();
    if (res.ok) setRequests(data.requests);
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFriends();
      void loadRequests();
    }, 0);
    // 对方同意申请发生在另一台设备，当前页面收不到本地事件；定时刷新后，
    // 发起方无需手动刷新，就能在好友列表里看到刚通过的好友。
    const polling = window.setInterval(() => { void loadFriends(); }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(polling);
    };
  }, [loadFriends, loadRequests]);

  useEffect(() => {
    if (!activeFriend) return undefined;
    const initial = window.setTimeout(() => { void loadMessages(activeFriend.id); }, 0);
    const polling = window.setInterval(() => { void loadMessages(activeFriend.id, true); }, 3000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(polling);
    };
  }, [activeFriend, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function searchUsers() {
    const value = query.trim();
    if (value.length < 2) {
      setError('至少输入 2 个字符');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const res = await apiFetch(`/api/friends/search?q=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? '搜索失败');
      else setResults(data.users);
    } catch {
      setError('网络不太好，请重试');
    } finally {
      setSearching(false);
    }
  }

  async function addFriend(person: SearchUser) {
    setError('');
    const res = await apiFetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: person.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? '添加失败');
      return;
    }
    setResults((current) => current.map((item) => (
      item.id === person.id ? { ...item, requestSent: true } : item
    )));
  }

  async function respondToRequest(request: FriendRequest, action: 'accept' | 'reject') {
    setError('');
    const res = await apiFetch('/api/friend-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: request.id, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? '处理申请失败');
      return;
    }
    setRequests((current) => current.filter((item) => item.id !== request.id));
    if (action === 'accept') {
      const friend = data.friend as Friend;
      await loadFriends();
      setActiveFriend(friend);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!activeFriend || !content) return;
    setDraft('');
    setError('');
    const res = await apiFetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: activeFriend.id, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDraft(content);
      setError(data.error ?? '发送失败');
      return;
    }
    setMessages((current) => [...current, data.message]);
    void loadFriends();
  }

  if (!user) {
    return (
      <section className="grid min-h-[55dvh] place-items-center px-6 text-center">
        <div>
          <span className="mx-auto grid size-20 place-items-center rounded-[2rem] bg-emerald-50 text-emerald-500">
            <MessageCircle size={38} />
          </span>
          <h1 className="mt-5 text-2xl font-black text-[#173366]">登录后和好友聊天</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">搜索玩家昵称，添加好友后即可发送消息。</p>
          <button
            type="button"
            onClick={() => openPanel('register')}
            className="mt-6 min-h-12 rounded-2xl bg-emerald-500 px-8 font-black text-white shadow-[0_6px_0_#22994b] active:translate-y-1 active:shadow-none"
          >
            登录 / 注册
          </button>
        </div>
      </section>
    );
  }

  if (activeFriend) {
    const friendOnline = onlineIds.has(activeFriend.id);
    return (
      <section className="flex min-h-[calc(100dvh-12rem)] flex-col px-4">
        <div className="flex items-center gap-3 border-b border-emerald-100 pb-3">
          <button type="button" onClick={() => setActiveFriend(null)} className="grid size-10 place-items-center rounded-full bg-white text-slate-500" aria-label="返回好友列表">
            <ArrowLeft size={21} />
          </button>
          <Avatar emoji={activeFriend.avatar} url={activeFriend.avatarUrl} className="size-11 rounded-2xl bg-white text-2xl" />
          <div>
            <h1 className="font-black text-[#173366]">{activeFriend.username}</h1>
            <p className={`text-xs font-bold ${friendOnline ? 'text-emerald-500' : 'text-slate-400'}`}>
              {!connected ? '状态连接中' : friendOnline ? '在线' : '离线'}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto py-4">
          {messages.length === 0 && <p className="py-12 text-center text-sm font-bold text-slate-400">还没有消息，打个招呼吧</p>}
          {messages.map((message) => (
            <div key={message.id} className={`flex items-end gap-2 ${message.mine ? 'justify-end' : 'justify-start'}`}>
              {!message.mine && (
                <Avatar emoji={activeFriend.avatar} url={activeFriend.avatarUrl} className="size-8 rounded-xl bg-white text-lg shadow-sm" />
              )}
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold leading-relaxed ${message.mine ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-white text-slate-700 shadow-sm'}`}>
                {message.content}
              </div>
              {message.mine && (
                <Avatar emoji={user.avatar} url={user.avatarUrl} className="size-8 rounded-xl bg-emerald-50 text-lg shadow-sm" />
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="mb-2 text-center text-xs font-bold text-rose-500">{error}</p>}
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex gap-2 rounded-2xl bg-white/90 p-2 shadow-lg backdrop-blur">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) void sendMessage(); }}
            maxLength={500}
            placeholder="输入消息…"
            aria-label="消息内容"
            className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <button type="button" onClick={() => { void sendMessage(); }} disabled={!draft.trim()} className="grid size-11 place-items-center rounded-xl bg-emerald-500 text-white disabled:bg-slate-300" aria-label="发送消息">
            <Send size={19} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-5">
      <div className="mb-5">
        <h1 className="text-[1.75rem] font-black tracking-[-0.04em] text-[#173366]">消息</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-600">找到玩家，成为好友后开始聊天</p>
      </div>

      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void searchUsers(); }}>
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-white bg-white/80 px-3 shadow-sm">
          <Search size={18} className="text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名或六位 UID" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
        </label>
        <button type="submit" disabled={searching} className="rounded-2xl bg-emerald-500 px-4 text-sm font-black text-white disabled:bg-slate-300">
          {searching ? '搜索中' : '搜索'}
        </button>
      </form>

      {error && <p className="mt-2 px-1 text-sm font-bold text-rose-500">{error}</p>}
      {results.length > 0 && (
        <div className="mt-4 space-y-2 rounded-3xl border border-white bg-white/60 p-3">
          <p className="px-1 text-xs font-black text-slate-400">搜索结果</p>
          {results.map((person) => (
            <div key={person.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
              <Avatar emoji={person.avatar} url={person.avatarUrl} className="size-11 rounded-xl bg-emerald-50 text-2xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-[#173366]">{person.username}</span>
                <span className="block font-mono text-[10px] font-bold text-emerald-600">UID {person.uid}</span>
              </span>
              <button type="button" disabled={person.isFriend || person.requestSent || person.requestReceived} onClick={() => { void addFriend(person); }} className="flex min-h-9 items-center gap-1 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-600 disabled:text-slate-400">
                {person.isFriend ? '已是好友' : person.requestSent ? '已发送' : person.requestReceived ? '待你处理' : <><Plus size={15} /> 加好友</>}
              </button>
            </div>
          ))}
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-6 rounded-3xl border-2 border-amber-100 bg-amber-50/80 p-3">
          <p className="mb-2 px-1 text-sm font-black text-amber-700">好友申请</p>
          <div className="space-y-2">
            {requests.map((request) => (
              <div key={request.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <Avatar emoji={request.sender.avatar} url={request.sender.avatarUrl} className="size-11 rounded-xl bg-emerald-50 text-2xl" />
                <span className="min-w-0 flex-1 truncate text-sm font-black text-[#173366]">{request.sender.username}</span>
                <button type="button" onClick={() => { void respondToRequest(request, 'reject'); }} className="min-h-9 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-500">拒绝</button>
                <button type="button" onClick={() => { void respondToRequest(request, 'accept'); }} className="min-h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-white">同意</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 mt-7 flex items-center gap-2 px-1">
        <Users size={20} className="text-emerald-600" />
        <h2 className="text-lg font-black text-[#173366]">好友</h2>
      </div>
      <div className="space-y-2">
        {friends.length === 0 && <p className="rounded-3xl bg-white/60 px-4 py-10 text-center text-sm font-bold text-slate-400">还没有好友，先搜索昵称添加一个吧</p>}
        {friends.map((friend) => (
          <button key={friend.id} type="button" onClick={() => {
            setFriends((current) => current.map((item) => (
              item.id === friend.id ? { ...item, unreadCount: 0 } : item
            )));
            setActiveFriend(friend);
          }} className="flex w-full items-center gap-3 rounded-2xl border border-white bg-white/85 p-3 text-left shadow-sm transition active:scale-[0.99]">
            <span className="relative grid size-12 place-items-center rounded-2xl bg-emerald-50 text-2xl">
              <Avatar emoji={friend.avatar} url={friend.avatarUrl} className="size-full rounded-2xl text-2xl" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white ${connected && onlineIds.has(friend.id) ? 'bg-emerald-400' : 'bg-slate-300'}`}
                aria-label={!connected ? '状态连接中' : onlineIds.has(friend.id) ? '在线' : '离线'}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-[#173366]">{friend.username}</span>
              <span className="block font-mono text-[10px] font-bold text-emerald-600">UID {friend.uid}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-400">
                <span className={connected && onlineIds.has(friend.id) ? 'text-emerald-500' : 'text-slate-400'}>
                  {!connected ? '连接中' : onlineIds.has(friend.id) ? '在线' : '离线'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{friend.lastMessage ?? '开始聊天'}</span>
              </span>
            </span>
            {friend.unreadCount ? (
              <span className="grid min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
              </span>
            ) : (
              <MessageCircle size={19} className="text-emerald-500" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
