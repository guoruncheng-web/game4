import { cookies } from 'next/headers';
import {
  bearerToken, readApiAccessToken, readSessionToken, SESSION_COOKIE,
} from './auth';
import { API_UID_HEADER } from './api-contract';
import { getSql } from './db';

export type CurrentUser = {
  id: number; uid: number; username: string; avatar: string; tokenVersion: number; isAdmin: boolean;
};

// bigserial 经 neon 回来是字符串,拿到手先转成 number(账号量远到不了 2^53)
type UserRow = {
  id: string | number; uid: number; username: string; avatar: string; token_version: number;
  is_admin: boolean; suspended_at: string | null;
};

/**
 * 服务端组件 / 路由处理器读当前登录用户。
 *
 * 整个函数包在 try 里:账号系统挂了(比如数据库连不上)也只应该表现为"未登录",
 * 绝不能把首页的游戏列表一起拖垮 —— 玩游戏本来就不需要登录。
 *
 * token 里签了发放时的 token_version,和库里当前值不一致就说明这条会话已经被
 * 登出或改密码作废了 —— 无状态 token 的"撤销"就靠这一步比对。
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const store = await cookies();
    return await resolveSession(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** 同上,但直接从一个标准 Request 上读 —— 给不方便用 cookies() 的地方 */
export async function resolveSession(token: string | undefined): Promise<CurrentUser | null> {
  const claims = readSessionToken(token);
  if (!claims) return null;
  const sql = getSql();
  const rows = (await sql`
    select id, uid, username, avatar, token_version, is_admin, suspended_at
    from users where id = ${claims.userId} limit 1
  `) as UserRow[];
  const row = rows[0];
  if (!row) return null;
  if (row.suspended_at) return null;
  if (row.token_version !== claims.tokenVersion) return null;
  return {
    id: Number(row.id),
    uid: row.uid,
    username: row.username,
    avatar: row.avatar,
    tokenVersion: row.token_version,
    isAdmin: row.is_admin,
  };
}

/**
 * 受保护 API 与游戏服务的统一身份入口：请求必须同时携带六位 uid 和 Bearer token。
 * Cookie 只负责 `/api/auth/me` 的启动续签，不能单独绕过这里。
 */
export async function resolveApiCredentials(
  rawUid: string | null | undefined,
  token: string | undefined,
): Promise<CurrentUser | null> {
  const uid = Number(rawUid);
  if (!/^\d{6}$/.test(rawUid ?? '') || !Number.isInteger(uid)) return null;
  const claims = readApiAccessToken(token);
  if (!claims || claims.uid !== uid) return null;

  const sql = getSql();
  const rows = (await sql`
    select id, uid, username, avatar, token_version, is_admin, suspended_at
    from users where id = ${claims.userId} and uid = ${uid} limit 1
  `) as UserRow[];
  const row = rows[0];
  if (!row || row.suspended_at || row.token_version !== claims.tokenVersion) return null;
  return {
    id: Number(row.id),
    uid: row.uid,
    username: row.username,
    avatar: row.avatar,
    tokenVersion: row.token_version,
    isAdmin: row.is_admin,
  };
}

export async function getRequestUser(request: Request): Promise<CurrentUser | null> {
  return resolveApiCredentials(request.headers.get(API_UID_HEADER), bearerToken(request));
}

/** 游戏 URL / WebSocket query 的认证入口。 */
export async function resolveGameCredentials(
  uid: string | null | undefined,
  token: string | null | undefined,
): Promise<CurrentUser | null> {
  return resolveApiCredentials(uid, token ?? undefined);
}
