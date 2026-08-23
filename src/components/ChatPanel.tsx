'use client';

import { ArrowLeft, MessageCircle, Plus, Search, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';

type Friend = {
  id: number;
  username: string;
  avatar: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};
type SearchUser = Friend & { isFriend: boolean };
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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeFriend, setActiveFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    const res = await fetch('/api/friends');
    const data = await res.json();
    if (res.ok) setFriends(data.friends);
  }, [user]);

  const loadMessages = useCallback(async (friendId: number, quiet = false) => {
    const res = await fetch(`/api/messages?friendId=${friendId}`);
    const data = await res.json();
    if (res.ok) setMessages(data.messages);
    else if (!quiet) setError(data.error ?? '消息加载失败');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFriends(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFriends]);

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
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(value)}`);
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
    const res = await fetch('/api/friends', {
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
      item.id === person.id ? { ...item, isFriend: true } : item
    )));
    await loadFriends();
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!activeFriend || !content) return;
    setDraft('');
    setError('');
    const res = await fetch('/api/messages', {
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
    return (
      <section className="flex min-h-[calc(100dvh-12rem)] flex-col px-4">
        <div className="flex items-center gap-3 border-b border-emerald-100 pb-3">
          <button type="button" onClick={() => setActiveFriend(null)} className="grid size-10 place-items-center rounded-full bg-white text-slate-500" aria-label="返回好友列表">
            <ArrowLeft size={21} />
          </button>
          <span className="grid size-11 place-items-center rounded-2xl bg-white text-2xl">{activeFriend.avatar}</span>
          <div>
            <h1 className="font-black text-[#173366]">{activeFriend.username}</h1>
            <p className="text-xs font-bold text-emerald-500">好友私聊</p>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto py-4">
          {messages.length === 0 && <p className="py-12 text-center text-sm font-bold text-slate-400">还没有消息，打个招呼吧</p>}
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold leading-relaxed ${message.mine ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-white text-slate-700 shadow-sm'}`}>
                {message.content}
              </div>
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户昵称" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
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
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-2xl">{person.avatar}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-black text-[#173366]">{person.username}</span>
              <button type="button" disabled={person.isFriend} onClick={() => { void addFriend(person); }} className="flex min-h-9 items-center gap-1 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-600 disabled:text-slate-400">
                {person.isFriend ? '已是好友' : <><Plus size={15} /> 加好友</>}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 mt-7 flex items-center gap-2 px-1">
        <Users size={20} className="text-emerald-600" />
        <h2 className="text-lg font-black text-[#173366]">好友</h2>
      </div>
      <div className="space-y-2">
        {friends.length === 0 && <p className="rounded-3xl bg-white/60 px-4 py-10 text-center text-sm font-bold text-slate-400">还没有好友，先搜索昵称添加一个吧</p>}
        {friends.map((friend) => (
          <button key={friend.id} type="button" onClick={() => setActiveFriend(friend)} className="flex w-full items-center gap-3 rounded-2xl border border-white bg-white/85 p-3 text-left shadow-sm transition active:scale-[0.99]">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-2xl">{friend.avatar}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-[#173366]">{friend.username}</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-slate-400">{friend.lastMessage ?? '开始聊天'}</span>
            </span>
            <MessageCircle size={19} className="text-emerald-500" />
          </button>
        ))}
      </div>
    </section>
  );
}
