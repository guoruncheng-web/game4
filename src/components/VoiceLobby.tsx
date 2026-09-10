'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';
import { ClubBrand, ClubIcon, cardStyle } from './ClubArt';
import { useAuth } from './AuthProvider';
import { withGameCredentials } from '@/lib/api-client';
import {
  voiceGameTitle,
  voiceRequest,
  type VoiceInvite,
  type VoiceRoom,
} from '@/lib/voice-room';

type LobbyTab = 'rooms' | 'invites';

export default function VoiceLobby() {
  const router = useRouter();
  const { user, credentials } = useAuth();
  const [tab, setTab] = useState<LobbyTab>('rooms');
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [invites, setInvites] = useState<VoiceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [roomData, inviteData] = await Promise.all([
        voiceRequest<{ rooms: VoiceRoom[] }>('/rooms'),
        voiceRequest<{ invites: VoiceInvite[] }>('/invites'),
      ]);
      setRooms(roomData.rooms);
      setInvites(inviteData.invites);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '语聊服务暂时不可用');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { void load(true); }, 8000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  async function enterRoom(roomId: string, inviteId?: string) {
    setError('');
    try {
      await voiceRequest(`/rooms/${roomId}/join`, {
        method: 'POST',
        body: JSON.stringify(inviteId ? { inviteId } : {}),
      });
      router.push(withGameCredentials(`/voice/${roomId}`, credentials));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '进入房间失败');
    }
  }

  async function decline(inviteId: string) {
    try {
      await voiceRequest(`/invites/${inviteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'decline' }),
      });
      setInvites((current) => current.filter((invite) => invite.id !== inviteId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    }
  }

  return (
    <div className={`voice-lobby ${tab === 'invites' ? 'voice-invitations-page' : ''}`}>
      {tab === 'invites' && <><header className="voice-page-top"><button type="button" aria-label="返回语聊大厅" onClick={() => setTab('rooms')}>‹</button><h2>房间邀请</h2></header><div className="voice-page-art"><ClubBrand /></div></>}
      <div className="voice-lobby-hero">
        <div><h2>语聊开黑</h2><p>找好友，一起聊</p></div>
        <button type="button" onClick={() => setCreateOpen(true)}><span aria-hidden="true">＋</span> 创建房间</button>
      </div>

      <div className="voice-lobby-tabs" role="tablist" aria-label="语聊内容">
        <button type="button" role="tab" aria-selected={tab === 'rooms'} onClick={() => setTab('rooms')}>好友房</button>
        <button type="button" role="tab" aria-selected={tab === 'invites'} onClick={() => setTab('invites')}>
          房间邀请{invites.length > 0 && <i>{invites.length > 99 ? '99+' : invites.length}</i>}
        </button>
      </div>

      {error && <div className="voice-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>重试</button></div>}
      {loading ? <VoiceLobbySkeleton /> : tab === 'rooms' ? (
        rooms.length > 0 ? <div className="voice-room-list">
          {rooms.map((room) => <button key={room.id} type="button" className="voice-room-card" onClick={() => void enterRoom(room.id)}>
            <span className="voice-room-illustration" aria-hidden="true" />
            <span className="voice-room-copy"><b>{room.title}</b><small>{voiceGameTitle(room.gameSlug)}</small><em><ClubIcon name="security" />{room.visibility === 'friends' ? '好友可见' : '凭邀请加入'}</em></span>
            <span className="voice-room-footer"><span className="voice-room-avatars" aria-label={`${room.members.length} 位成员`}>
              {room.members.slice(0, 3).map((member) => <Avatar key={member.uid} emoji={member.avatar} url={member.avatarUrl} />)}
            </span><span className="voice-room-count"><ClubIcon name="profile" />{room.members.length}/{room.maxMembers}</span></span>
          </button>)}
        </div> : <div className="voice-empty"><ClubIcon name="voice" /><b>好友还没开房</b><p>创建一个房间，邀请好友来聊天吧</p><button type="button" onClick={() => setCreateOpen(true)}>创建房间</button></div>
      ) : invites.length > 0 ? <div className="voice-invite-list">
        {invites.map((invite) => <article key={invite.id} className="voice-invite-card">
          <div className="voice-invite-sender"><ClubIcon name="profile" /><span><b>{invite.inviter.username}</b><small>来自好友的邀请</small></span></div>
          <div className="voice-invite-room" style={cardStyle(invite.gameSlug ?? 'thirteen')}><b>{invite.roomTitle}</b><small>{voiceGameTitle(invite.gameSlug)}</small></div>
          <div className="voice-invite-actions"><button type="button" onClick={() => void decline(invite.id)}>婉拒</button><button type="button" onClick={() => void enterRoom(invite.roomId, invite.id)}>进入房间</button></div>
        </article>)}
      </div> : <div className="voice-empty"><ClubIcon name="messages" /><b>暂时没有房间邀请</b><p>好友发来的邀请会出现在这里</p></div>}

      {createOpen && <CreateRoomSheet username={user?.username ?? '玩家'} onClose={() => setCreateOpen(false)} onCreated={(room) => router.push(withGameCredentials(`/voice/${room.id}`, credentials))} />}
    </div>
  );
}

function VoiceLobbySkeleton() {
  return <div className="voice-room-list" aria-label="正在加载房间">{[0, 1, 2, 3].map((item) => <span key={item} className="voice-room-card voice-room-card-loading" />)}</div>;
}

function CreateRoomSheet({ username, onClose, onCreated }: { username: string; onClose: () => void; onCreated: (room: VoiceRoom) => void }) {
  const [title, setTitle] = useState(`${username} 的语音房`.slice(0, 40));
  const [visibility, setVisibility] = useState<'friends' | 'private'>('friends');
  const [approval, setApproval] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const room = await voiceRequest<VoiceRoom>('/rooms', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), visibility, requiresMicApproval: approval }),
      });
      onCreated(room);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败');
      setSaving(false);
    }
  }

  return <div className="voice-sheet-backdrop voice-full-page-backdrop" role="presentation">
    <section className="voice-create-sheet" role="dialog" aria-modal="true" aria-labelledby="voice-create-title">
      <header><h2 id="voice-create-title">创建房间</h2><button type="button" onClick={onClose} aria-label="关闭创建房间">×</button></header>
      <div className="voice-create-body">
      <label>房间名称<input value={title} maxLength={40} onChange={(event) => setTitle(event.target.value)} /><small>{title.length}/40</small></label>
      <fieldset><legend>房间可见性</legend><div>
        <label className={visibility === 'friends' ? 'is-selected' : ''}><input type="radio" name="visibility" value="friends" checked={visibility === 'friends'} onChange={() => setVisibility('friends')} /><ClubIcon name="profile" /><b>好友房</b><small>好友可加入</small></label>
        <label className={visibility === 'private' ? 'is-selected' : ''}><input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} /><ClubIcon name="security" /><b>私密房</b><small>凭邀请加入</small></label>
      </div></fieldset>
      <label className="voice-switch-row"><span><b>上麦需审批</b><small>开启后由房主或管理员批准</small></span><input type="checkbox" checked={approval} onChange={(event) => setApproval(event.target.checked)} /></label>
      {error && <p className="voice-form-error" role="alert">{error}</p>}
      <button className="voice-primary" type="button" disabled={saving || !title.trim()} onClick={() => void submit()}>{saving ? '正在创建…' : '创建并进入'}</button>
      </div>
    </section>
  </div>;
}
