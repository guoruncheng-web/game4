/**
 * 服务端房间的行为测试:占座、满座、退座保留余额、消息分发。
 *
 *   pnpm fish:test
 *
 * 不起 WebSocket、不连数据库 —— 直接驱动适配层。
 * 改了 server/fish-room.mjs 或 ws.mjs 的座位逻辑之后跑一遍。
 */
import { createFishAdapter } from '../../../server/fish-room.mjs';

const sent = [];
const a = createFishAdapter({ send: (userId, data) => sent.push({ userId, data }) });

const assert = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

// 四个人占座
const seats = [101, 102, 103, 104].map((id, i) => a.join(id, `p${i}`));
assert(JSON.stringify(seats) === '[0,1,2,3]', '四个人依次拿到 0-3 号座');
assert(a.join(105, 'p5') === null, '第五个人被拒(满座)');
assert(a.size === 4, 'size = 4');

// hello 应该发给了每个人,且座位号对得上
const hellos = sent.filter((m) => m.data.t === 'hello');
assert(hellos.length === 4 && hellos[3].data.seat === 3, '每人各收到一条 hello,座位号正确');
assert(hellos[0].data.seats.length === 1 && hellos[3].data.seats.length === 4, 'hello 里的座位快照随人数增长');

// ping 走适配层,不进 FishRoom
sent.length = 0;
a.input(101, { t: 'ping', id: 7 });
assert(sent.length === 1 && sent[0].data.t === 'pong' && sent[0].data.id === 7, 'ping 回 pong');

// 开炮要扣钱,且 wallet 只发给本人
sent.length = 0;
a.input(101, { t: 'fire', id: 1, angle: -Math.PI / 2 });
const wallets = sent.filter((m) => m.data.t === 'wallet');
assert(wallets.length === 1 && wallets[0].userId === 101, 'wallet 只发给开炮的人');
assert(wallets[0].data.balance === 499, `开一炮扣 1 金币(实际 ${wallets[0].data.balance})`);

// 退座保留余额,重进拿回来
a.leave(101);
assert(a.size === 3, '退座后 size = 3');
sent.length = 0;
const back = a.join(101, 'p0');
assert(back === 0, '空出来的 0 号座能被重新占');
const hello2 = sent.find((m) => m.data.t === 'hello');
assert(hello2.data.balance === 499, `重进拿回退座前的余额(实际 ${hello2.data.balance})`);

// 广播:一个人开炮,pop 会发给房里所有人
sent.length = 0;
a.input(102, { t: 'fire', id: 2, angle: -Math.PI / 2 });
await new Promise((r) => setTimeout(r, 2800)); // 等网飞完全程(最长 2.2s)必定炸开
const pops = sent.filter((m) => m.data.t === 'pop');
assert(pops.length > 0 && new Set(pops.map((p) => p.userId)).size === 4, 'pop 广播给了房里全部 4 个人');

a.destroy();
assert(a.size === 0, 'destroy 之后座位全清');
