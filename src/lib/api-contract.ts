export const API_UID_HEADER = 'x-game-uid';

export type GameCredentials = { uid: number; token: string };

/** 把认证信息拼到游戏页、iframe 或 WebSocket 地址，保留已有 query/hash。 */
export function withGameCredentials(href: string, credentials: GameCredentials | null): string {
  if (!credentials) return href;
  const [withoutHash, hash = ''] = href.split('#', 2);
  const separator = withoutHash.includes('?') ? '&' : '?';
  const authQuery = new URLSearchParams({
    uid: String(credentials.uid),
    token: credentials.token,
  }).toString();
  return `${withoutHash}${separator}${authQuery}${hash ? `#${hash}` : ''}`;
}
