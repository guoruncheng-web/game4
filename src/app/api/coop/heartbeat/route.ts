import { NextResponse } from 'next/server';
import { currentRoom, listInvitable, touchPresence } from '@/lib/coop';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 心跳。菜单页每 3 秒调一次。
 *
 * **刻意把「上报在线」「拉在线列表」「查房间状态」合成一个请求。**
 * 拆成三个轮询的话,每个在大厅的人每 3 秒就是三个请求 + 三次数据库往返 ——
 * 人一多就是白白翻三倍的压力,而它们本来就是同一时刻要的同一批数据。
 *
 * 握手完成之后前端必须停掉这个轮询(见 COOP.md §7 第 10 条),
 * 局内同步走 DataChannel,不需要服务器。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  // 3 秒一次的正常节奏是每分钟 20 次,给到 40 次容得下重试和多开一个标签页
  if (!rateLimit(`coop-hb:${user.id}:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
  }

  const room = await currentRoom(user.id);
  // 已经在房间里就不再上报 idle,否则会把自己从 busy 改回去、又能被别人邀请
  await touchPresence(user.id, room ? 'busy' : 'idle');

  return NextResponse.json({
    me: { id: user.id, username: user.username },
    room,
    // 在房间里时不需要在线列表,省一次 join 查询
    online: room ? [] : await listInvitable(user.id),
  });
}
