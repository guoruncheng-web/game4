import type { IAgoraRTC, IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

export type RtcGrant = {
  appId: string; channel: string; uid: number; token: string;
  role: 'publisher' | 'subscriber'; publishAudio: boolean; expiresAt: number;
};
export type RtcState = {
  connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  microphone: 'off' | 'starting' | 'on';
  error: string; playbackBlocked: boolean; speakers: number[];
};
export const INITIAL_RTC_STATE: RtcState = { connection: 'idle', microphone: 'off', error: '', playbackBlocked: false, speakers: [] };
/** 说话检测：每 200ms 采样实际音轨电平，停顿后保留 700ms，避免字间闪烁。 */
const SPEAKING_SAMPLE_MS = 200;
const SPEAKING_HOLD_MS = 700;
const SPEAKING_LEVEL = 0.06;
function level(track: { getVolumeLevel?: () => number } | null | undefined) {
  try { return track?.getVolumeLevel?.() ?? 0; } catch { return 0; }
}
type Sdk = Pick<IAgoraRTC, 'createClient' | 'createMicrophoneAudioTrack' | 'on' | 'off'>;
type Connection = {
  client: IAgoraRTCClient | null; sdk: Sdk | null; grant: RtcGrant | null;
  track: IMicrophoneAudioTrack | null; micGeneration: number;
  work: Promise<void>; autoplay?: () => void; timer?: ReturnType<typeof setTimeout>; meter?: ReturnType<typeof setInterval>;
};

function errorText(error: unknown): string {
  const code = String((error as { code?: string; name?: string })?.code ?? (error as { name?: string })?.name ?? '');
  if (/PERMISSION|NotAllowed|NOT_ALLOWED/.test(code)) return '未获得麦克风权限，请在浏览器设置中允许后重试';
  if (/NOT_FOUND|NotFound|DEVICE_NOT/.test(code)) return '没有找到麦克风，请连接设备后重试';
  if (/NOT_READABLE|NotReadable|DEVICE_BUSY/.test(code)) return '麦克风正被其他应用占用，请关闭占用后重试';
  return '语音连接暂不可用，请重试';
}

/** 只消费后端权限；SDK、票据和音轨不进入全局对象或持久存储。 */
export class VoiceRtcSession {
  private current: Connection | null = null;
  private disposed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private allowed = false;
  private publishAllowed = false;
  private audible = new Set<number>();
  private loud = new Map<number, number>();
  private state: RtcState = { ...INITIAL_RTC_STATE };

  constructor(
    private readonly uid: number,
    private readonly grant: () => Promise<RtcGrant>,
    private readonly load: () => Promise<Sdk>,
    private readonly changed: (state: RtcState) => void,
  ) {}

  private emit(patch: Partial<RtcState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.changed(this.state);
  }
  private live(c: Connection) { return !this.disposed && this.allowed && this.current === c; }

  setAuthority(active: boolean, publishAllowed: boolean, speakers: number[]) {
    this.allowed = active;
    this.publishAllowed = active && publishAllowed;
    this.audible = new Set(speakers);
    if (!active) { this.disconnect(); return; }
    if (!this.publishAllowed) this.mute();
    const c = this.current;
    for (const remote of c?.client?.remoteUsers ?? []) {
      if (!this.audible.has(Number(remote.uid))) remote.audioTrack?.stop();
      else if (remote.audioTrack && !remote.audioTrack.isPlaying) this.play(c!, remote);
    }
    this.refreshSpeakers();
  }

  async connect() {
    if (this.disposed || !this.allowed || this.current) return;
    clearTimeout(this.reconnectTimer);
    const c: Connection = { client: null, sdk: null, grant: null, track: null, micGeneration: 0, work: Promise.resolve() };
    this.current = c;
    this.emit({ ...INITIAL_RTC_STATE, connection: 'connecting' });
    try {
      const grant = await this.grant();
      if (!this.live(c)) return;
      this.validate(grant);
      c.grant = grant;
      c.sdk = await this.load();
      if (!this.live(c)) return;
      c.autoplay = () => { if (this.live(c)) this.emit({ playbackBlocked: true }); };
      c.sdk.on('autoplay-failed', c.autoplay);
      const client = c.sdk.createClient({ mode: 'live', codec: 'vp8' });
      c.client = client;
      client.on('user-published', (remote, type) => {
        if (type !== 'audio' || !this.live(c)) return;
        void client.subscribe(remote, 'audio').then(() => {
          if (this.live(c)) this.play(c, remote); else remote.audioTrack?.stop();
        }).catch(() => { if (this.live(c)) this.emit({ error: '接收语音失败，请重新连接' }); });
      });
      client.on('user-unpublished', remote => { remote.audioTrack?.stop(); });
      client.on('user-left', remote => {
        remote.audioTrack?.stop();
        this.loud.delete(Number(remote.uid));
        if (this.live(c)) this.refreshSpeakers();
      });
      client.on('token-privilege-will-expire', () => { void this.renew(c); });
      client.on('token-privilege-did-expire', () => { if (this.live(c)) this.fail('语音凭证已到期，请重新连接'); });
      client.on('connection-state-change', state => {
        if (!this.live(c)) return;
        if (state === 'RECONNECTING') {
          // 旧连接重连时可能自动重新发布；直接离开并以新听众会话恢复。
          this.disconnect();
          this.emit({ connection: 'reconnecting' });
          this.reconnectTimer = setTimeout(() => {
            if (typeof navigator === 'undefined' || navigator.onLine) void this.connect();
            else this.emit({ connection: 'idle' });
          }, 1500);
        }
        if (state === 'CONNECTED' && this.state.connection === 'reconnecting') {
          void this.renew(c).then(() => { if (this.live(c)) this.emit({ connection: 'connected' }); });
        }
        if (state === 'DISCONNECTED' && this.state.connection !== 'connecting') this.fail('语音连接已断开，请重新连接');
      });
      await client.setClientRole('audience');
      if (!this.live(c)) return;
      await client.join(grant.appId, grant.channel, grant.token, grant.uid);
      if (!this.live(c)) { await client.leave().catch(() => undefined); return; }
      c.meter = setInterval(() => this.sample(c), SPEAKING_SAMPLE_MS);
      this.emit({ connection: 'connected' });
      this.scheduleRenew(c);
    } catch (error) { if (this.live(c)) this.fail(errorText(error)); }
  }

  private validate(grant: RtcGrant) {
    if (grant.uid !== this.uid || !grant.appId || !grant.channel || !grant.token || grant.expiresAt <= Date.now() / 1000) throw new Error('invalid_rtc_grant');
    if (this.current?.grant && (grant.channel !== this.current.grant.channel || grant.appId !== this.current.grant.appId)) throw new Error('changed_rtc_identity');
  }
  private scheduleRenew(c: Connection) {
    clearTimeout(c.timer);
    if (!this.live(c)) return;
    const delay = Math.max(1000, Math.min(30000, ((c.grant?.expiresAt ?? 0) * 1000 - Date.now()) - 30000));
    c.timer = setTimeout(() => { void this.renew(c); }, delay);
  }
  private renew(c: Connection) {
    c.work = c.work.then(async () => {
      if (!this.live(c)) return;
      const grant = await this.grant();
      if (!this.live(c)) return;
      this.validate(grant);
      if (!grant.publishAudio) this.mute();
      await c.client!.renewToken(grant.token);
      if (!this.live(c)) return;
      c.grant = grant;
      this.scheduleRenew(c);
    }).catch(() => { if (this.live(c)) this.fail('无法续期语音权限，请检查登录和房间状态后重连'); });
    return c.work;
  }

  async enableMicrophone() {
    const c = this.current;
    if (!c || !this.live(c) || !this.publishAllowed || this.state.connection !== 'connected' || this.state.microphone !== 'off') return;
    const generation = ++c.micGeneration;
    const permitted = () => this.live(c) && this.publishAllowed && generation === c.micGeneration;
    this.emit({ microphone: 'starting', error: '' });
    c.work = c.work.then(async () => {
      if (!permitted()) return;
      const grant = await this.grant();
      if (!permitted()) return;
      this.validate(grant);
      if (!grant.publishAudio || grant.role !== 'publisher') throw new Error('microphone_not_authorized');
      await c.client!.renewToken(grant.token);
      if (!permitted()) return;
      c.grant = grant;
      await c.client!.setClientRole('host');
      if (!permitted()) return;
      const track = await c.sdk!.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true, encoderConfig: 'speech_standard' });
      if (!permitted()) { track.stop(); track.close(); return; }
      c.track = track;
      track.on('track-ended', () => { if (c.track === track) { this.mute(); this.emit({ error: '麦克风已断开，请重新开启' }); } });
      await c.client!.publish(track);
      if (!permitted()) { track.stop(); track.close(); await c.client!.unpublish(track).catch(() => undefined); return; }
      this.emit({ microphone: 'on' });
      this.scheduleRenew(c);
    }).catch(error => { if (this.live(c) && generation === c.micGeneration) { this.mute(); this.emit({ error: errorText(error) }); } });
    await c.work;
  }

  /** 同步关闭硬件，不等待网络、续期或尚未完成的权限弹窗。 */
  mute() {
    const c = this.current;
    if (c) {
      c.micGeneration++;
      const track = c.track; c.track = null;
      if (track) { track.removeAllListeners(); track.stop(); track.close(); }
      c.work = c.work.then(async () => {
        if (!this.live(c) || !c.client) return;
        if (track) await c.client.unpublish(track).catch(() => undefined);
        await c.client.setClientRole('audience').catch(() => undefined);
      });
    }
    this.loud.delete(this.uid);
    this.emit({ microphone: 'off', speakers: this.state.speakers.filter(uid => uid !== this.uid) });
  }
  /** 只统计已授权的发声者：本人须已发布麦克风，远端须仍在权威麦位上。 */
  private sample(c: Connection) {
    if (!this.live(c)) return;
    const now = Date.now();
    if (this.state.microphone === 'on' && level(c.track) > SPEAKING_LEVEL) this.loud.set(this.uid, now);
    for (const remote of c.client?.remoteUsers ?? []) {
      const uid = Number(remote.uid);
      if (this.audible.has(uid) && level(remote.audioTrack) > SPEAKING_LEVEL) this.loud.set(uid, now);
    }
    this.refreshSpeakers(now);
  }
  private refreshSpeakers(now = Date.now()) {
    for (const [uid, at] of this.loud) {
      const allowed = uid === this.uid ? this.state.microphone === 'on' : this.audible.has(uid);
      if (!allowed || now - at > SPEAKING_HOLD_MS) this.loud.delete(uid);
    }
    const speakers = [...this.loud.keys()].sort((a, b) => a - b);
    if (speakers.join(',') !== this.state.speakers.join(',')) this.emit({ speakers });
  }
  private play(c: Connection, remote: IAgoraRTCRemoteUser) {
    if (!this.live(c) || !this.audible.has(Number(remote.uid))) return;
    try { remote.audioTrack?.play(); } catch { this.emit({ playbackBlocked: true }); }
  }
  resumePlayback() {
    const c = this.current;
    if (!c || !this.live(c)) return;
    this.emit({ playbackBlocked: false });
    for (const remote of c.client?.remoteUsers ?? []) this.play(c, remote);
  }
  private fail(error: string) { this.disconnect(); this.emit({ connection: 'error', error }); }
  disconnect() {
    clearTimeout(this.reconnectTimer);
    const c = this.current;
    this.current = null;
    if (c) {
      clearTimeout(c.timer); clearInterval(c.meter); c.micGeneration++;
      if (c.autoplay) c.sdk?.off('autoplay-failed', c.autoplay);
      c.track?.removeAllListeners(); c.track?.stop(); c.track?.close(); c.track = null;
      for (const remote of c.client?.remoteUsers ?? []) remote.audioTrack?.stop();
      c.client?.removeAllListeners();
      void c.client?.leave().catch(() => undefined);
    }
    this.loud.clear();
    this.emit({ ...INITIAL_RTC_STATE });
  }
  dispose() { this.disposed = true; this.disconnect(); }
}
