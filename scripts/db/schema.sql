-- 账号表。一键注册生成的用户名和密码就落在这里。
-- 密码只存 scrypt 哈希(格式:scrypt$N$r$p$salt$hash),明文只在注册那一次返回给前端。
create table if not exists users (
  id            bigserial   primary key,
  username      text        not null unique,
  password_hash text        not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- 会话版本号。会话 token 是无状态签名的,服务端本身没法作废它,
-- 于是把这个数字签进 token:登出和改密码时 +1,旧 token 的版本号对不上就失效。
-- 这是"登出即时生效"和"密码泄露后能踢掉别人"的唯一手段。
alter table users add column if not exists token_version integer not null default 0;

-- 登录时按用户名精确查,用户名统一小写存,唯一索引已经够用
create index if not exists users_created_at_idx on users (created_at desc);

-- ---------------------------------------------------------------- 联机协作(neon-strike-2d)
-- 设计与协议见 src/games/neon-strike-2d/COOP.md。
-- 这三张表只负责「找到人」和「握手」,不承担任何局内同步 ——
-- 游戏数据走 WebRTC DataChannel 直连,一个字节都不经过数据库。

-- 在线状态。靠心跳维持,超过 COOP_PRESENCE_TTL 没心跳就当离线。
-- 不做「登出时清理」之类的精确维护:心跳过期是唯一的离线判据,少一条路径少一类 bug。
create table if not exists coop_presence (
  user_id      bigint      primary key references users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  -- idle 才能被邀请,busy 表示已经在局里
  status       text        not null default 'idle'
);
create index if not exists coop_presence_seen_idx on coop_presence (last_seen_at desc);

-- 房间。一局一条。
create table if not exists coop_rooms (
  id         bigserial   primary key,
  host_id    bigint      not null references users(id) on delete cascade,
  guest_id   bigint      not null references users(id) on delete cascade,
  -- pending / accepted / connected / declined / ended
  state      text        not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coop_rooms_host_idx on coop_rooms (host_id, state);
create index if not exists coop_rooms_guest_idx on coop_rooms (guest_id, state);

-- WebRTC 信令(SDP / ICE)。**读到即删,这是管道不是消息历史。**
-- 留着的后果是重连时把上一轮的 ICE candidate 重放一遍,
-- 表现为「偶尔连不上、重试就好了」—— 这类问题最难查。
create table if not exists coop_signals (
  id         bigserial   primary key,
  room_id    bigint      not null references coop_rooms(id) on delete cascade,
  from_id    bigint      not null,
  kind       text        not null,
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);
create index if not exists coop_signals_room_idx on coop_signals (room_id, id);
