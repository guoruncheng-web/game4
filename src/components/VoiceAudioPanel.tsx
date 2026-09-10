'use client';

import { useEffect, useRef, useState } from 'react';
import { voiceRequest, type VoiceRoom } from '@/lib/voice-room';
import { INITIAL_RTC_STATE, VoiceRtcSession, type RtcGrant } from '@/lib/voice/rtc-session';

type Props = { room: VoiceRoom | null; roomId: string; uid?: number; healthy: boolean; microphoneBlocked: boolean };

export default function VoiceAudioPanel({ room, roomId, uid, healthy, microphoneBlocked }: Props) {
  const session = useRef<VoiceRtcSession | null>(null);
  const [state, setState] = useState(INITIAL_RTC_STATE);
  const requested = useRef(false);
  const authority = useRef({ active: false, publish: false, speakers: [] as number[] });
  const active = !!uid && healthy && room?.state !== 'closed' && room?.me?.status === 'active' && room.me.uid === uid;
  const publish = active && !microphoneBlocked && room?.me?.micSeat != null && !room.me.mutedByStaff;
  const speakers = (room?.members ?? []).filter(m => m.status === 'active' && m.micSeat != null && !m.mutedByStaff).map(m => m.uid).join(',');

  useEffect(() => {
    if (!uid) return;
    const rtc = new VoiceRtcSession(uid, async () => {
      const data = await voiceRequest<{ rtc: RtcGrant }>(`/rooms/${roomId}/rtc-token`, { method: 'POST', signal: AbortSignal.timeout(12000) });
      return data.rtc;
    }, async () => {
      const sdk = (await import('agora-rtc-sdk-ng')).default;
      sdk.setLogLevel(4);
      sdk.disableLogUpload();
      return sdk;
    }, setState);
    session.current = rtc;
    const stop = () => { rtc.disconnect(); };
    const reconnect = () => { if (requested.current && authority.current.active) void rtc.connect(); };
    const pagehide = () => { requested.current = false; stop(); };
    window.addEventListener('offline', stop);
    window.addEventListener('online', reconnect);
    window.addEventListener('pagehide', pagehide);
    return () => {
      rtc.dispose();
      session.current = null;
      window.removeEventListener('offline', stop);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('pagehide', pagehide);
    };
  }, [roomId, uid]);

  useEffect(() => {
    authority.current = { active, publish, speakers: speakers ? speakers.split(',').map(Number) : [] };
    session.current?.setAuthority(active, publish, authority.current.speakers);
    if (active && requested.current) void session.current?.connect();
  }, [active, publish, speakers, uid, roomId]);

  const connected = state.connection === 'connected';
  const connecting = state.connection === 'connecting' || state.connection === 'reconnecting';
  const label = { idle: '语音未连接', connecting: '正在连接语音', connected: '语音已连接', reconnecting: '语音重连中', error: '语音连接失败' }[state.connection];
  return <section className="voice-audio-panel" aria-label="房间语音">
    <div className="voice-audio-status" role="status"><b>{label}</b><span>{state.microphone === 'on' ? '麦克风已开启' : state.microphone === 'starting' ? '正在开启麦克风…' : '麦克风已关闭'}</span></div>
    <div className="voice-audio-controls">
      {!connected && <button type="button" disabled={!active || connecting} onClick={() => { requested.current = true; void session.current?.connect(); }}>{connecting ? '连接中…' : state.connection === 'error' ? '重连语音' : '加入语音'}</button>}
      {connected && <>
        <button type="button" disabled={!publish && state.microphone === 'off'} aria-pressed={state.microphone !== 'off'} onClick={() => state.microphone === 'off' ? void session.current?.enableMicrophone() : session.current?.mute()}>{state.microphone === 'off' ? '开启麦克风' : state.microphone === 'starting' ? '取消开启' : '关闭麦克风'}</button>
        <button type="button" onClick={() => session.current?.resumePlayback()}>播放声音</button>
      </>}
      {(connected || connecting) && <button type="button" onClick={() => { requested.current = false; session.current?.disconnect(); }}>断开语音</button>}
    </div>
    <small>{connected ? publish ? '开启麦克风后，房间成员才能听到你。听不到声音时可点“播放声音”。' : '正在收听房间语音，上麦获批后可开启麦克风。' : '加入后可收听；开启麦克风需要你的授权。'}</small>
    {state.speakers.length > 0 && <p className="voice-audio-speakers">正在说话：{state.speakers.map(id => room?.members.find(m => m.uid === id)?.username ?? '房间成员').join('、')}</p>}
    {(state.error || state.playbackBlocked) && <p role="alert">{state.error || '浏览器暂停了声音播放，请点击“播放声音”。'}</p>}
  </section>;
}
