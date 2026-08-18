/**
 * 极简内存限流。
 *
 * **它只是第一道门槛,不是安全边界**:Serverless 每个实例各有一份计数,
 * 攻击者拿到多个实例就能绕过。真要扛住撞库,得换成共享存储(比如 Upstash Redis)。
 * 现阶段账号量小,先用它挡住最蠢的那一类脚本。
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** 登录成功后把这个 key 的计数清掉,免得用户自己输错几次、输对了反而被自己挡在门外 */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

// ---------- 登录失败计数 ----------

/**
 * 按 key(IP / 用户名)记连续失败次数,达到阈值后登录必须先过一次图形验证码。
 * 同样是每实例一份的尽力而为 —— 目的是把无脑撞库脚本的成本抬起来,不是安全边界。
 */
const failures = new Map<string, Bucket>();
/** 连续失败到这个数,后续登录必须带验证码 */
export const LOGIN_CAPTCHA_THRESHOLD = 3;
/** 失败计数 15 分钟不动就自己过期 */
const FAILURE_WINDOW_MS = 15 * 60_000;

export function failureCount(key: string): number {
  const bucket = failures.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return 0;
  return bucket.count;
}

export function recordFailure(key: string) {
  const now = Date.now();
  const bucket = failures.get(key);
  if (!bucket || bucket.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  // 每失败一次就把窗口往后推,免得攻击者卡着窗口边缘匀速试
  bucket.resetAt = now + FAILURE_WINDOW_MS;
}

export function clearFailures(key: string) {
  failures.delete(key);
}

/** 顺手清掉过期的桶,免得内存无限涨 */
export function sweepRateLimits() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  for (const [key, bucket] of failures) {
    if (bucket.resetAt <= now) failures.delete(key);
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
