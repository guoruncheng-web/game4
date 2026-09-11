'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, LoaderCircle } from 'lucide-react';
import { voiceRequest, type VoiceRoom } from '@/lib/voice-room';
import { INITIAL_RTC_STATE, VoiceRtcSession, type RtcGrant } from '@/lib/voice/rtc-session';

type Props = { onSpeakersChange: (speakers: number[]) => void; onHint: (message: string) => void; compact?: boolean; room: VoiceRoom | null; roomId: string; uid?: number; healthy: boolean; microphoneBlocked: boolean };

/** 进房自动以听众身份连接；输入框左侧只保留麦克风开关图标。 */
export default function VoiceAudioPanel({ compact = false, onSpeakersChange, onHint, room, roomId, uid, healthy, microphoneBlocked }: Props) {
  const session = useRef<VoiceRtcSession | null>(null);
  const [state, setState] = useState(INITIAL_RTC_STATE);
  const requested = useRef(true);
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

  useEffect(() => { onSpeakersChange(state.speakers); }, [state.speakers, onSpeakersChange]);
  useEffect(() => { if (state.error) onHint(state.error); }, [state.error, onHint]);

  const connecting = state.connection === 'connecting' || state.connection === 'reconnecting';
  const label = { idle: '语音未连接', connecting: '正在连接语音', connected: '语音已连接', reconnecting: '语音重连中', error: '语音连接失败' }[state.connection];
  async function toggleMicrophone() {
    const rtc = session.current;
    if (!rtc) return;
    requested.current = true;
    rtc.resumePlayback();
    if (state.microphone !== 'off') { rtc.mute(); return; }
    if (!publish) { onHint(room?.me?.mutedByStaff ? '你已被管理员禁麦' : room?.me?.micRequestedAt ? '上麦申请等待房主或管理员批准' : '请先点击一个空麦位上麦'); return; }
    if (state.connection !== 'connected') await rtc.connect();
    await rtc.enableMicrophone();
  }
  return <section className={`voice-audio-panel ${compact ? 'is-compact' : ''}`} aria-label="房间语音">
    <div className="voice-audio-status sr-only" role="status"><b>{label}</b><span>{state.microphone === 'on' ? '麦克风已开启' : state.microphone === 'starting' ? '正在开启麦克风…' : '麦克风已关闭'}</span></div>
    <div className="voice-audio-controls">
      <button type="button" className="voice-microphone-toggle" data-publish={publish ? 'allowed' : 'denied'} disabled={!active || connecting} aria-label={state.microphone === 'off' ? '开启麦克风' : state.microphone === 'starting' ? '取消开启麦克风' : '关闭麦克风'} aria-pressed={state.microphone !== 'off'} title={label} onClick={() => void toggleMicrophone()}>{connecting ? <LoaderCircle size={22} aria-hidden="true" /> : state.microphone === 'off' ? <MicOff size={22} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}</button>
      {state.playbackBlocked && <button type="button" className="voice-playback-retry" aria-label="恢复房间声音" onClick={() => session.current?.resumePlayback()}><Volume2 size={20} aria-hidden="true" /></button>}
    </div>
  </section>;
}
