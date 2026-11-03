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

/**
 * 自定义头像的公开地址。`version` 是 `users.avatar_version`,0 表示没传过图 ——
 * 这时返回 null,由调用方回退到 emoji。
 *
 * 版本号进 query 是为了让 `/api/avatar/[uid]` 能发 immutable 长缓存:
 * 换了头像 URL 就变,不用给图片发 no-cache。
 */
export function avatarUrlFor(uid: number, version: number): string | null {
  if (!Number.isInteger(version) || version <= 0) return null;
  return `/api/avatar/${uid}?v=${version}`;
}
