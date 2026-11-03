import {
  createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual,
} from 'node:crypto';

/**
 * 账号与会话。
 *
 * 这套的产品形态是"一键开号":后端直接生成用户名和密码,前端弹窗让用户自己记住,
 * 之后用这对凭据登录。所以没有邮箱、没有找回流程 —— 密码丢了账号就找不回来了,
 * 这一点必须在前端说清楚(弹窗文案已经写了)。
 *
 * 密码用 scrypt 哈希(Node 内置,不引第三方依赖);
 * 会话是 HMAC 签名的 cookie,不落会话表 —— 但 payload 里签了用户的 token_version,
 * 登出/改密码时把库里的版本号 +1,旧 token 就作废了,不必为此维护一整张会话表。
 */

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 32 };

/** 去掉了容易看混的 0/O/1/I/l,用户要照着弹窗手抄的 */
const SAFE_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
const PASSWORD_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
/** 默认头像池。注册时随机挑一个并持久化，之后登录不会变化。 */
const DEFAULT_AVATARS = ['🐯', '🦊', '🐼', '🐨', '🐸', '🦁', '🐵', '🐰', '🐙', '🦄', '🐲', '👾'];

export const SESSION_COOKIE = 'gb_session';
export const CAPTCHA_COOKIE = 'gb_captcha';
/** 会话有效期 30 天 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * 密码长度上限。
 * scrypt 是同步且刻意慢的,参数里 N=16384 意味着每次校验都要吃掉一块 CPU 和 16MB 内存;
 * 不封顶的话,一个 1MB 的密码就能把函数实例占死 —— 这是登录接口最廉价的 DoS 面。
 */
export const MAX_PASSWORD_LENGTH = 128;
/** 生成的密码是 12 位;用户自己改密码时至少得有 8 位 */
export const MIN_PASSWORD_LENGTH = 8;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 24) {
    throw new Error('AUTH_SECRET 未配置或太短(至少 24 字符)。生成:openssl rand -base64 32');
  }
  return value;
}

// ---------- 密码 ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // 长度先卡死,别让超长输入进到 scrypt 里
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    // 定长比较,避免按字节提前返回泄露信息
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 用户自己设的密码要过一道最低要求;返回 null 表示合格 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return '密码格式不对';
  if (password.length < MIN_PASSWORD_LENGTH) return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  if (password.length > MAX_PASSWORD_LENGTH) return `密码最多 ${MAX_PASSWORD_LENGTH} 位`;
  return null;
}

// ---------- 一键开号 ----------

function pick(chars: string, length: number) {
  let out = '';
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  return out;
}

/** 形如 player-7k3m9x,全小写,直接当登录名 */
export function generateUsername(): string {
  return `player-${pick(SAFE_CHARS, 6)}`;
}

/** 12 位混合密码,约 71 bit 熵,够扛在线爆破 */
export function generatePassword(): string {
  return pick(PASSWORD_CHARS, 12);
}

export function generateAvatar(): string {
  return DEFAULT_AVATARS[randomInt(DEFAULT_AVATARS.length)];
}

export function normalizeUsername(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLowerCase() : '';
}

// ---------- 会话 ----------

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** payload 是 `用户id.版本号.过期时间`,版本号对不上就是被登出/改过密码的旧 token */
export function createSessionToken(userId: number, tokenVersion: number): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${userId}.${tokenVersion}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export type SessionClaims = { userId: number; tokenVersion: number };

export function readSessionToken(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [rawId, rawVersion, rawExpires, signature] = parts;
  const payload = `${rawId}.${rawVersion}.${rawExpires}`;
  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(rawExpires) * 1000 < Date.now()) return null;
  const userId = Number(rawId);
  const tokenVersion = Number(rawVersion);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(tokenVersion) || tokenVersion < 0) return null;
  return { userId, tokenVersion };
}

/** 签名用的 HMAC 也给验证码复用,省一套密钥管理 */
export function signValue(payload: string) {
  return sign(payload);
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** 从请求头里取一条 cookie。route handler 拿到的是标准 Request,没有 cookies() 那层封装 */
export function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}
