/**
 * 自定义头像的端到端冒烟测试。
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts
 *   pnpm dev
 *   node tools/sim/avatar-upload-test.mjs http://127.0.0.1:3000
 *   node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts --clean
 *
 * 图片在这里现造,不引任何图形库 —— 服务端那套把关只读文件头、从不解码像素,
 * 所以造一个头部合法的样本就足以把它走通,而且省掉了把二进制素材塞进仓库。
 */
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- 样本图片

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([head, typed, crc]);
}
/** 一张纯色的真 PNG(能被任何解码器打开),用来走"正常上传"这条路 */
function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // 位深
  ihdr[9] = 2;   // 真彩色
  // 每行开头是一个字节的过滤器类型(0 = 不过滤),后面是 RGB 像素
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * (1 + size * 3) + 1 + x * 3;
      raw[at] = (x * 3) & 0xff;
      raw[at + 1] = (y * 3) & 0xff;
      raw[at + 2] = 0x90;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/**
 * 一张只有文件头合法的 VP8L WebP。
 *
 * 像素数据是填充的 —— 浏览器解不开它,但这里要验的正是**服务端只读头、不解码**:
 * 客户端 canvas 导出的头像默认就是 WebP,这条分支必须有覆盖,
 * 而手搓一张真能解码的无损 WebP 需要实现整个 VP8L 熵编码器,不值得。
 */
function makeWebpHeader(width, height) {
  const payload = Buffer.alloc(64, 0);
  payload[0] = 0x2f; // VP8L 签名
  const bits = (width - 1) | ((height - 1) << 14);
  payload.writeUInt32LE(bits >>> 0, 1);
  const chunk = Buffer.concat([Buffer.from('VP8L', 'ascii'), sizeLE(payload.length), payload]);
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'), sizeLE(4 + chunk.length), Buffer.from('WEBP', 'ascii'), chunk,
  ]);
}
function sizeLE(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:3000';
let uid = 0;
let token = '';

function authHeaders(extra = {}) {
  return { 'X-Game-UID': String(uid), Authorization: `Bearer ${token}`, ...extra };
}

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed += 1;
}

/**
 * 上传一次。撞到限流就直接停 —— 一轮测试要传六次,而上传接口是按账号限流的,
 * 十分钟内连跑几轮必然触顶。不特判的话表现是后面一串莫名其妙的断言失败。
 */
async function upload(body) {
  const res = await fetch(`${ORIGIN}/api/avatar`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'image/png' }), body,
  });
  if (res.status === 429) {
    console.error('\n撞到上传限流了(同一账号 10 分钟 20 次)。等几分钟,或重启 dev server 清掉内存计数再跑。');
    process.exit(2);
  }
  return res;
}

// ---------------------------------------------------------------- 登录

{
  const res = await fetch(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-e2e-1', password: 'Testpass123' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `登录失败,先跑 seed-e2e.mts:${JSON.stringify(body)}`);
  uid = body.uid;
  token = body.token;
  check('1 登录成功,登录响应带 avatarUrl 字段', 'avatarUrl' in body, `avatarUrl=${body.avatarUrl}`);
}

// 上一轮测试可能留了一张图,先删干净,让 "没有头像 → 404" 那条断言有意义
await fetch(`${ORIGIN}/api/avatar`, { method: 'DELETE', headers: authHeaders() });

{
  const res = await fetch(`${ORIGIN}/api/avatar/${uid}?v=1`, { redirect: 'manual' });
  check('2 没上传过头像时读图返回 404', res.status === 404, `status=${res.status}`);
}

// ---------------------------------------------------------------- 拒绝非法输入

{
  const res = await upload(Buffer.from('这不是图片,但 Content-Type 说它是'));
  check('3 内容不是图片时拒绝(不信 Content-Type)', res.status === 400, `status=${res.status}`);
}

const png = makePng(96);

{
  // 把 IHDR 里的宽高改成 4000×4000 —— 字节数没变,尺寸炸了。
  // 这一条测的就是解压炸弹:压缩后很小、解开来能吃掉一个 GB 的内存。
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(4000, 16);
  bomb.writeUInt32BE(4000, 20);
  const res = await upload(bomb);
  const body = await res.json();
  check('4 文件头声明的尺寸超上限时拒绝', res.status === 400, `status=${res.status} ${body.error ?? ''}`);
}

{
  // WebP 是客户端 canvas 的默认输出格式,这条覆盖 readWebp 的 VP8L 分支。
  // 注意声明的 Content-Type 是 png 而内容是 webp —— 顺便再验一次"认魔数不认头"
  const res = await upload(makeWebpHeader(256, 256));
  const body = await res.json();
  check('5 WebP(VP8L)按魔数被识别并接受', res.status === 200, `status=${res.status} ${body.error ?? ''}`);
  const image = await fetch(ORIGIN + body.avatarUrl);
  check('6 存回来的 WebP 用 image/webp 发出', image.headers.get('content-type') === 'image/webp',
    String(image.headers.get('content-type')));
}

{
  const res = await upload(makeWebpHeader(900, 900));
  check('7 WebP 头里的超大尺寸同样被拒', res.status === 400, `status=${res.status}`);
}

{
  const res = await upload(png);
  check('8 合法 PNG 被接受', res.status === 200, `status=${res.status}`);
}

{
  const res = await fetch(`${ORIGIN}/api/avatar`, {
    method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png,
  });
  check('9 不带凭据上传被拒', res.status === 401, `status=${res.status}`);
}

// ---------------------------------------------------------------- 读图与缓存

let version = 0;
let avatarUrl = '';
{
  const res = await fetch(`${ORIGIN}/api/auth/me`, { headers: authHeaders() });
  const body = await res.json();
  avatarUrl = body.user.avatarUrl ?? '';
  version = Number(new URL(avatarUrl, ORIGIN).searchParams.get('v'));
  check('10 /api/auth/me 带出 avatarUrl', avatarUrl.startsWith(`/api/avatar/${uid}?v=`), avatarUrl);
}

let etag = '';
{
  const res = await fetch(ORIGIN + avatarUrl);
  const bytes = Buffer.from(await res.arrayBuffer());
  etag = res.headers.get('etag') ?? '';
  check('11 按 avatarUrl 能取回原始字节', res.status === 200 && bytes.equals(png),
    `status=${res.status} ${bytes.byteLength}B/${png.byteLength}B`);
  check('12 图片是 PNG 且发的是 immutable 长缓存',
    res.headers.get('content-type') === 'image/png'
    && (res.headers.get('cache-control') ?? '').includes('immutable'),
    `${res.headers.get('content-type')} / ${res.headers.get('cache-control')}`);
  check('13 带了 nosniff', res.headers.get('x-content-type-options') === 'nosniff');
}

{
  const res = await fetch(ORIGIN + avatarUrl, { headers: { 'If-None-Match': etag } });
  check('14 ETag 命中时回 304', res.status === 304, `status=${res.status}`);
}

{
  // 旧版本号必须被重定向到当前 URL,而不是直接把新图塞给旧地址 ——
  // 那样这个旧地址会把新图 immutable 缓存住,以后换头像再也刷不掉
  const res = await fetch(`${ORIGIN}/api/avatar/${uid}?v=${version - 1}`, { redirect: 'manual' });
  check('15 版本号过期时 302 跳到当前版本',
    res.status === 302 && (res.headers.get('location') ?? '').endsWith(`?v=${version}`),
    `status=${res.status} → ${res.headers.get('location')}`);
}

// ---------------------------------------------------------------- 版本号单调

{
  const res = await upload(png);
  const body = await res.json();
  check('16 再传一次版本号 +1', body.version === version + 1, `${version} → ${body.version}`);
  version = body.version;
}

{
  const res = await fetch(`${ORIGIN}/api/avatar`, { method: 'DELETE', headers: authHeaders() });
  const body = await res.json();
  check('17 删除后 avatarUrl 为 null,版本号转负(幅度不减)',
    res.status === 200 && body.avatarUrl === null && body.version === -version,
    JSON.stringify(body));
  const image = await fetch(`${ORIGIN}/api/avatar/${uid}?v=${version}`, { redirect: 'manual' });
  check('18 删除后读图 404', image.status === 404, `status=${image.status}`);
}

{
  // 这一条是整个版本号编码存在的理由:删掉再传,版本号必须继续往上走。
  // 如果这里回到 1,浏览器里 ?v=1 那条 immutable 缓存会让用户永远看到那张旧图
  const res = await upload(png);
  const body = await res.json();
  check('19 删除后重传,版本号不回退', body.version > version, `删除前 ${version} → 重传后 ${body.version}`);
}

// 收尾:别把测试图留在测试账号上
await fetch(`${ORIGIN}/api/avatar`, { method: 'DELETE', headers: authHeaders() });

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
