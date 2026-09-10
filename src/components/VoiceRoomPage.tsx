'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Avatar from './Avatar';
import VoiceGameSheet from './VoiceGameSheet';
import VoiceAudioPanel from './VoiceAudioPanel';
import { ClubBrand, ClubIcon, cardStyle } from './ClubArt';
import { useAuth } from './AuthProvider';
import { apiFetch, withGameCredentials } from '@/lib/api-client';
import {
  voiceGameTitle,
  voiceRequest,
  type VoiceMember,
  type VoiceMessage,
  type VoiceRoom,
} from '@/lib/voice-room';

type Friend = { uid: number; username: string; avatar: string; avatarUrl?: string | null };
type Sheet = 'invite' | 'requests' | 'manage' | 'games' | null;

export default function VoiceRoomPage({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { credentials } = useAuth();
  const [room, setRoom] = useState<VoiceRoom | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [releasingMic, setReleasingMic] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selected, setSelected] = useState<VoiceMember | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (quiet = false) => {
    try {
      const nextRoom = await voiceRequest<VoiceRoom>(`/rooms/${roomId}`);
      setRoom(nextRoom);
      if (nextRoom.state !== 'closed' && nextRoom.me?.status === 'active') {
        const messageData = await voiceRequest<{ messages: VoiceMessage[] }>(`/rooms/${roomId}/messages`);
        setMessages(messageData.messages);
      }
      setConnectionLost(false);
      if (!quiet) setError('');
    } catch (reason) {
      setConnectionLost(true);
      setError(reason instanceof Error ? reason.message : '房间暂时不可用');
    }
  }, [roomId]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => void refresh(true), 4000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  useEffect(() => { messageEnd.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function updateMic(action: 'request' | 'release') {
    if (busy) return;
    if (action === 'release') setReleasingMic(true);
    setBusy(true);
    try {
      const data = await voiceRequest<{ state: string; room: VoiceRoom }>(`/rooms/${roomId}/mic-request`, {
        method: 'POST', body: JSON.stringify({ action }),
      });
      setRoom(data.room);
      setError(data.state === 'pending' ? '上麦申请已提交，等待房主或管理员批准' : '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally { setBusy(false); setReleasingMic(false); }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await voiceRequest(`/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
      setDraft('');
      await refresh(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '消息发送失败');
    } finally { setBusy(false); }
  }

  async function leave() {
    if (busy) return;
    setLeaving(true);
    setBusy(true);
    try {
      await voiceRequest(`/rooms/${roomId}/leave`, { method: 'POST' });
      router.replace(withGameCredentials('/?tab=voice', credentials));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '离开房间失败');
      setLeaving(false);
      setBusy(false);
    }
  }

  if (!room) return <main className="voice-room-page"><div className="voice-room-shell voice-room-loading"><ClubIcon name="voice" /><b>{error || '正在进入语聊房间…'}</b>{error && <Link href={withGameCredentials('/?tab=voice', credentials)}>返回语聊大厅</Link>}</div></main>;

  if (room.state === 'closed' || room.me?.status !== 'active') return <main className="gb-system-page"><section className="gb-system-card"><div className="gb-state-art gb-state-art--offline" aria-hidden="true" /><h1>{room.state === 'closed' ? '房间已关闭' : '你已离开房间'}</h1><p>回到语聊大厅，寻找新的房间吧。</p><Link href={withGameCredentials('/?tab=voice', credentials)}>返回语聊大厅</Link></section></main>;

  const me = room.me;
  const manages = me?.role === 'owner' || me?.role === 'moderator';
  const pending = room.members.filter((member) => member.micRequestedAt);
  const micStatus = me?.mutedByStaff ? '已被管理员禁麦' : me?.micSeat != null ? `已在 ${me.micSeat} 号麦位` : me?.micRequestedAt ? '等待上麦审批' : '当前未上麦';
  const seats = Array.from({ length: Math.min(room.maxSpeakers, 8) }, (_, index) => room.members.find((member) => member.micSeat === index + 1) ?? null);

  return <main className="voice-room-page voice-room-v2">
    <div className="voice-room-shell">
      <header className="voice-room-header">
        <button type="button" aria-label="返回" onClick={() => setLeaveOpen(true)}>‹</button>
        <div><b>{room.title}</b><small>{room.visibility === 'friends' ? '好友房' : '私密房'}{room.roomCode ? ` · ${room.roomCode}` : ''}</small></div>
        <button type="button" aria-label="房间操作" onClick={() => manages ? setSheet('manage') : setLeaveOpen(true)}>•••</button>
      </header>
      <div className="voice-room-status" aria-label="房间状态"><span><i aria-hidden="true" />{room.members.length}/{room.maxMembers} 人在线</span><span className={`voice-connection ${connectionLost ? 'is-lost' : ''}`}><i aria-hidden="true" />{connectionLost ? '房间连接中断' : '房间已连接'}</span></div>
      {connectionLost && <div className="voice-error" role="alert"><span>连接中断，正在尝试恢复</span><button type="button" onClick={() => void refresh()}>重新连接</button></div>}

      <VoiceAudioPanel room={room} roomId={roomId} uid={credentials?.uid} healthy={!connectionLost && !leaving} microphoneBlocked={releasingMic} />

      {room.gameSlug && <button type="button" onClick={() => setSheet('games')} className="voice-game-banner"><span className="voice-game-thumbnail" style={cardStyle(room.gameSlug)} /><span><b>{voiceGameTitle(room.gameSlug)}</b><small>和房间好友一起玩</small></span><em>查看游戏 ›</em></button>}

      <section className="voice-stage" aria-label="语聊麦位">
        <div className="voice-stage-heading"><span><small>VOICE LOUNGE</small><h2>一起聊</h2></span><b>{room.members.filter((member) => member.micSeat != null).length}/{room.maxSpeakers} 麦位</b>{manages && <button type="button" aria-label="管理房间麦位" onClick={() => setSheet('manage')}><span className="voice-stage-settings-icon" aria-hidden="true" /></button>}</div>
        <div className="voice-seat-grid">
          {seats.map((member, index) => <button key={index} type="button" className={`voice-seat ${member ? 'is-occupied' : ''}`} onClick={() => { if (member && manages && member.uid !== me?.uid && member.role !== 'owner' && (me?.role === 'owner' || member.role === 'member')) { setSelected(member); setSheet('manage'); } }} disabled={!member}>
            <span>{member ? <Avatar emoji={member.avatar} url={member.avatarUrl} /> : <i className="voice-seat-empty-icon" aria-hidden="true" />}{member?.mutedByStaff && <em>禁麦</em>}{member?.role === 'owner' && <strong>房主</strong>}</span>
            <b>{member?.username ?? `${index + 1}号麦位`}</b>
            {member?.mutedByStaff && <small>已禁麦</small>}
          </button>)}
        </div>
        <div className="voice-stage-members"><span>{room.members.slice(0, 5).map((member) => <Avatar key={member.uid} emoji={member.avatar} url={member.avatarUrl} />)}</span><b>{room.members.length} 位成员</b><button type="button" onClick={() => setSheet('invite')}><i aria-hidden="true">＋</i>邀请好友</button></div>
        {room.maxSpeakers > 8 && <p className="voice-more-seats">还有 {room.maxSpeakers - 8} 个麦位，可在成员列表中查看</p>}
      </section>

      <button type="button" className="voice-game-list-entry" aria-haspopup="dialog" onClick={() => setSheet('games')}><ClubIcon name="games" /><span><b>一起玩游戏</b><small>打开游戏列表，选一个喜欢的</small></span><em>游戏列表 ›</em></button>

      <section className="voice-chat-panel">
        <div className="voice-stage-title"><span><small>ROOM CHAT</small><h2>房间聊天</h2></span><b>{messages.length} 条消息</b></div>
        <div className="voice-message-list" aria-live="polite">
          {messages.length === 0 && <div className="voice-message-empty"><span aria-hidden="true">•••</span><b>从一句问候开始</b><small>聊聊今天想玩什么吧</small></div>}
          {messages.map((message) => <div key={message.id} className={`voice-message ${message.sender.uid === me?.uid ? 'is-mine' : ''}`}>
            <Avatar emoji={message.sender.avatar} url={message.sender.avatarUrl} />
            <span><small>{message.sender.username}</small><b>{message.content}</b></span>
          </div>)}
          <div ref={messageEnd} />
        </div>
      </section>

      {error && <div className="voice-room-toast" role="status">{error}<button type="button" onClick={() => setError('')} aria-label="关闭">×</button></div>}
      <div className="voice-room-dock">
        <div className="voice-room-actions"><span>{micStatus}</span>{me?.micSeat != null ? <button type="button" className="voice-mic-main is-active" aria-label="离开麦位" onClick={() => void updateMic('release')} disabled={busy}><ClubIcon name="voice" />下麦</button> : me?.micRequestedAt ? <button type="button" className="voice-mic-main is-pending" aria-label="取消上麦申请" onClick={() => void updateMic('release')} disabled={busy}><ClubIcon name="voice" />取消申请</button> : <button type="button" className="voice-mic-main" aria-label="申请上麦" onClick={() => void updateMic('request')} disabled={busy || me?.mutedByStaff}><ClubIcon name="voice" />申请上麦</button>}<button type="button" className="voice-invite-main" aria-label="邀请好友" onClick={() => setSheet('invite')}>邀请好友</button>{manages && pending.length > 0 && <button type="button" className="voice-requests-main" onClick={() => setSheet('requests')}>审批 <i>{pending.length}</i></button>}</div>
        <form className="voice-composer" onSubmit={sendMessage}><input aria-label="房间消息" value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="发一条房间消息…" /><button type="submit" disabled={busy || !draft.trim()} aria-label="发送房间消息">发送</button></form>
      </div>

      {sheet === 'games' && <VoiceGameSheet onClose={() => setSheet(null)} />}
      {sheet === 'invite' && <InviteSheet roomId={roomId} onClose={() => setSheet(null)} onError={setError} />}
      {sheet === 'requests' && <RequestSheet room={room} onClose={() => setSheet(null)} onUpdate={setRoom} onError={setError} />}
      {sheet === 'manage' && <ManageSheet room={room} selected={selected} onSelect={setSelected} onClose={() => { setSheet(null); setSelected(null); }} onUpdate={setRoom} onLeave={() => setLeaveOpen(true)} onClosed={() => router.replace(withGameCredentials('/?tab=voice', credentials))} onError={setError} />}
      {leaveOpen && <ConfirmModal title="离开房间？" text="离开后将退出麦位并断开语音连接。" confirm="确认离开" busy={busy} onCancel={() => setLeaveOpen(false)} onConfirm={() => void leave()} />}
    </div>
  </main>;
}

function SheetFrame({ title, children, onClose, fullPage = false }: { title: string; children: ReactNode; onClose: () => void; fullPage?: boolean }) {
  return <div className={`voice-sheet-backdrop ${fullPage ? 'voice-full-page-backdrop' : ''}`}><section className={`voice-action-sheet ${fullPage ? 'voice-management-page' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="关闭">{fullPage ? '‹' : '×'}</button></header>{fullPage && <div className="voice-page-art"><ClubBrand /></div>}{children}</section></div>;
}

function InviteSheet({ roomId, onClose, onError }: { roomId: string; onClose: () => void; onError: (value: string) => void }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sent, setSent] = useState<number[]>([]);
  useEffect(() => { apiFetch('/api/friends').then((response) => response.json()).then((data: { friends?: Friend[] }) => setFriends(data.friends ?? [])).catch(() => onError('好友列表加载失败')); }, [onError]);
  async function invite(uid: number) {
    try { await voiceRequest(`/rooms/${roomId}/invites`, { method: 'POST', body: JSON.stringify({ targetUid: uid }) }); setSent((current) => [...current, uid]); }
    catch (reason) { onError(reason instanceof Error ? reason.message : '邀请失败'); }
  }
  return <SheetFrame title="邀请好友" onClose={onClose}><p className="voice-sheet-help">选择好友发送房间邀请</p><div className="voice-sheet-list">{friends.length ? friends.map((friend) => <div key={friend.uid}><Avatar emoji={friend.avatar} url={friend.avatarUrl} /><span><b>{friend.username}</b><small>UID {friend.uid}</small></span><button type="button" disabled={sent.includes(friend.uid)} onClick={() => void invite(friend.uid)}>{sent.includes(friend.uid) ? '已邀请' : '邀请'}</button></div>) : <p className="voice-sheet-empty">还没有可以邀请的好友</p>}</div></SheetFrame>;
}

function RequestSheet({ room, onClose, onUpdate, onError }: { room: VoiceRoom; onClose: () => void; onUpdate: (room: VoiceRoom) => void; onError: (value: string) => void }) {
  const pending = room.members.filter((member) => member.micRequestedAt);
  async function act(member: VoiceMember, action: 'approve-mic' | 'reject-mic') {
    try { onUpdate(await voiceRequest(`/rooms/${room.id}/members/${member.uid}`, { method: 'PATCH', body: JSON.stringify({ action }) })); }
    catch (reason) { onError(reason instanceof Error ? reason.message : '处理失败'); }
  }
  return <SheetFrame title={`上麦申请 · ${pending.length}`} onClose={onClose}><div className="voice-sheet-list">{pending.map((member) => <div key={member.uid}><Avatar emoji={member.avatar} url={member.avatarUrl} /><span><b>{member.username}</b><small>申请发言</small></span><button type="button" className="is-secondary" onClick={() => void act(member, 'reject-mic')}>拒绝</button><button type="button" onClick={() => void act(member, 'approve-mic')}>同意</button></div>)}{pending.length === 0 && <p className="voice-sheet-empty">暂无上麦申请</p>}</div></SheetFrame>;
}

function ManageSheet({ room, selected, onSelect, onClose, onUpdate, onLeave, onClosed, onError }: { room: VoiceRoom; selected: VoiceMember | null; onSelect: (member: VoiceMember | null) => void; onClose: () => void; onUpdate: (room: VoiceRoom) => void; onLeave: () => void; onClosed: () => void; onError: (value: string) => void }) {
  const me = room.me;
  const owner = me?.role === 'owner';
  const [editor, setEditor] = useState<'title' | 'game' | 'visibility' | 'close' | 'members' | 'requests' | null>(null);
  const [title, setTitle] = useState(room.title);
  const [gameSlug, setGameSlug] = useState(room.gameSlug ?? '');
  const [visibility, setVisibility] = useState(room.visibility);
  const [busy, setBusy] = useState(false);
  async function memberAction(action: string) {
    if (!selected) return;
    try { onUpdate(await voiceRequest(`/rooms/${room.id}/members/${selected.uid}`, { method: 'PATCH', body: JSON.stringify({ action }) })); onSelect(null); }
    catch (reason) { onError(reason instanceof Error ? reason.message : '操作失败'); }
  }
  async function roomAction(action: 'set-title' | 'set-game' | 'set-visibility' | 'close', value?: string) {
    if (busy) return;
    setBusy(true);
    const body = action === 'set-title' ? { action, title: value } : action === 'set-game' ? { action, gameSlug: value || null } : action === 'set-visibility' ? { action, visibility: value } : { action };
    try {
      const result = await voiceRequest<VoiceRoom | { state: 'closed' }>(`/rooms/${room.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      if ('state' in result && result.state === 'closed' && !('members' in result)) { onClosed(); return; }
      onUpdate(result as VoiceRoom);
      setEditor(null);
    } catch (reason) { onError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  }
  if (selected && selected.uid !== me?.uid) return <SheetFrame title="成员操作" onClose={() => onSelect(null)}><div className="voice-member-summary"><Avatar emoji={selected.avatar} url={selected.avatarUrl} /><span><b>{selected.username}</b><small>UID {selected.uid}</small></span></div><div className="voice-manage-list">{selected.micRequestedAt && <button type="button" onClick={() => void memberAction('approve-mic')}>允许上麦</button>}{selected.micSeat != null && <button type="button" onClick={() => void memberAction('lower-mic')}>移下麦位</button>}<button type="button" onClick={() => void memberAction(selected.mutedByStaff ? 'staff-unmute' : 'staff-mute')}>{selected.mutedByStaff ? '解除禁麦' : '禁止发言'}</button>{owner && <button type="button" onClick={() => void memberAction(selected.role === 'moderator' ? 'unset-moderator' : 'set-moderator')}>{selected.role === 'moderator' ? '取消管理员' : '设为管理员'}</button>}<button type="button" className="is-danger" onClick={() => void memberAction('kick')}>移出房间</button></div></SheetFrame>;
  if (editor === 'title') return <SheetFrame title="修改房间名称" onClose={() => setEditor(null)}><div className="voice-setting-editor"><input value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)} /><small>{title.length}/40</small><button type="button" disabled={busy || !title.trim()} onClick={() => void roomAction('set-title', title.trim())}>保存</button></div></SheetFrame>;
  if (editor === 'game') return <SheetFrame title="关联游戏" onClose={() => setEditor(null)}><div className="voice-choice-list">{[{ slug: '', title: '暂不关联游戏' }, { slug: 'thirteen', title: '南方十三张' }, { slug: 'umo', title: 'UMO' }, { slug: 'ludo', title: '飞行棋' }, { slug: 'fish-hunter', title: '深海捕鱼' }].map((game) => <button key={game.slug} type="button" className={gameSlug === game.slug ? 'is-selected' : ''} onClick={() => { setGameSlug(game.slug); void roomAction('set-game', game.slug); }}>{game.title}<span>{gameSlug === game.slug ? '✓' : ''}</span></button>)}</div></SheetFrame>;
  if (editor === 'visibility') return <SheetFrame title="房间可见性" onClose={() => setEditor(null)}><div className="voice-choice-list"><button type="button" className={visibility === 'friends' ? 'is-selected' : ''} onClick={() => { setVisibility('friends'); void roomAction('set-visibility', 'friends'); }}>好友房<small>好友可加入</small><span>{visibility === 'friends' ? '✓' : ''}</span></button><button type="button" className={visibility === 'private' ? 'is-selected' : ''} onClick={() => { setVisibility('private'); void roomAction('set-visibility', 'private'); }}>私密房<small>凭邀请或房间码加入</small><span>{visibility === 'private' ? '✓' : ''}</span></button></div></SheetFrame>;
  if (editor === 'close') return <SheetFrame title="关闭房间？" onClose={() => setEditor(null)}><div className="voice-close-room"><ClubIcon name="voice" /><p>关闭后所有成员都会离开，当前聊天与麦位将结束。</p><button type="button" disabled={busy} onClick={() => void roomAction('close')}>{busy ? '正在关闭…' : '确认关闭房间'}</button></div></SheetFrame>;
  if (editor === 'requests') return <RequestSheet room={room} onClose={() => setEditor(null)} onUpdate={onUpdate} onError={onError} />;
  if (editor === 'members') return <SheetFrame title={`房间成员 · ${room.members.length}`} onClose={() => setEditor(null)}><div className="voice-sheet-list">{room.members.map((member) => <button type="button" key={member.uid} className="voice-member-row" disabled={member.uid === me?.uid || member.role === 'owner' || (!owner && member.role === 'moderator')} onClick={() => onSelect(member)}><Avatar emoji={member.avatar} url={member.avatarUrl} /><span><b>{member.username}</b><small>{member.role === 'owner' ? '房主' : member.role === 'moderator' ? '管理员' : '成员'}</small></span><em>›</em></button>)}</div></SheetFrame>;
  return <SheetFrame fullPage title="房间管理" onClose={onClose}><div className="voice-manage-meta">{owner ? <><button type="button" onClick={() => setEditor('title')}><span>房间名称</span><b>{room.title} ›</b></button><button type="button" onClick={() => setEditor('game')}><span>关联游戏</span><b>{voiceGameTitle(room.gameSlug)} ›</b></button><button type="button" onClick={() => setEditor('visibility')}><span>可见性</span><b>{room.visibility === 'friends' ? '好友房' : '私密房'} ›</b></button></> : <><div><span>房间名称</span><b>{room.title}</b></div><div><span>关联游戏</span><b>{voiceGameTitle(room.gameSlug)}</b></div></>}{room.roomCode && <div><span>房间码</span><b>{room.roomCode}</b></div>}</div><div className="voice-manage-meta voice-manage-members"><button type="button" onClick={() => setEditor('members')}><span>房间成员</span><b>{room.members.length}人 ›</b></button><button type="button" onClick={() => setEditor('requests')}><span>上麦申请</span><b>{room.members.filter((member) => member.micRequestedAt).length} ›</b></button></div>{owner && <button type="button" className="voice-close-room-button" onClick={() => setEditor('close')}>关闭房间</button>}<button type="button" className="voice-leave-room" onClick={onLeave}>离开房间</button></SheetFrame>;
}

function ConfirmModal({ title, text, confirm, busy, onCancel, onConfirm }: { title: string; text: string; confirm: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="voice-sheet-backdrop voice-confirm-backdrop"><section className="voice-confirm" role="alertdialog" aria-modal="true" aria-labelledby="voice-confirm-title"><ClubIcon name="voice" /><h2 id="voice-confirm-title">{title}</h2><p>{text}</p><div><button type="button" onClick={onCancel}>再聊一会</button><button type="button" disabled={busy} onClick={onConfirm}>{confirm}</button></div></section></div>;
}
