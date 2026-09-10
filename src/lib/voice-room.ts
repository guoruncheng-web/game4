import { apiFetch } from './api-client';

export type VoiceRole = 'owner' | 'moderator' | 'member';
export type VoiceMember = {
  uid: number;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  role: VoiceRole;
  status: 'active' | 'left' | 'kicked';
  micSeat: number | null;
  micRequestedAt: string | null;
  mutedByStaff: boolean;
  joinedAt: string;
};

export type VoiceRoom = {
  id: string;
  title: string;
  gameSlug: string | null;
  visibility: 'friends' | 'private';
  state: 'open' | 'playing' | 'closed';
  roomCode: string | null;
  maxMembers: number;
  maxSpeakers: number;
  requiresMicApproval: boolean;
  members: VoiceMember[];
  me: VoiceMember | null;
};

export type VoiceInvite = {
  id: string;
  roomId: string;
  roomTitle: string;
  gameSlug: string | null;
  inviter: { uid: number; username: string };
  expiresAt: string;
};

export type VoiceMessage = {
  id: number;
  content: string;
  createdAt: string;
  sender: { uid: number; username: string; avatar: string; avatarUrl?: string | null };
};

const ERROR_TEXT: Record<string, string> = {
  room_not_found: '房间不存在或你没有访问权限',
  room_closed: '房间已经关闭',
  room_full: '房间人数已满',
  room_invite_required: '需要好友邀请或正确房间码',
  active_membership_required: '你已经不在这个房间里',
  mic_full: '麦位已满',
  member_staff_muted: '你已被房间管理员禁麦',
  mic_request_not_found: '这条上麦申请已经处理',
  target_already_in_room: '好友已经在房间里',
  friendship_required: '只能邀请好友',
  user_blocked: '暂时无法邀请该好友',
  rtc_not_configured: '语音服务尚未配置',
  upstream_unavailable: '语聊服务暂时不可用',
};

export async function voiceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await apiFetch(`/api/voice${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(ERROR_TEXT[data.error ?? ''] ?? data.error ?? '操作失败，请稍后再试');
  return data;
}

export const VOICE_GAMES = [
  { slug: '', title: '暂不关联游戏' },
  { slug: 'thirteen', title: '南方十三张' },
  { slug: 'umo', title: 'UMO' },
  { slug: 'ludo', title: '飞行棋' },
  { slug: 'fish-hunter', title: '深海捕鱼' },
] as const;

export function voiceGameTitle(slug: string | null) {
  if (!slug) return '一起聊天';
  return VOICE_GAMES.find((game) => game.slug === (slug ?? ''))?.title ?? '一起聊天';
}
