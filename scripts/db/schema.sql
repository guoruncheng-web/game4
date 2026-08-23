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

-- 每个账号都有一个可直接展示的头像。先用 emoji 做默认头像；以后开放换头像时，
-- 仍然复用这个字段，不需要让前端根据用户名临时猜一个。
alter table users add column if not exists avatar text not null default '🎮';

-- 登录时按用户名精确查,用户名统一小写存,唯一索引已经够用
create index if not exists users_created_at_idx on users (created_at desc);

-- ---------------------------------------------------------------- 好友与私聊
-- 好友关系只存一条无方向边，较小的用户 ID 永远放 user_a，避免 A/B 与 B/A 重复。
create table if not exists friendships (
  user_a     bigint      not null references users(id) on delete cascade,
  user_b     bigint      not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists friend_requests (
  id           bigserial   primary key,
  sender_id    bigint      not null references users(id) on delete cascade,
  recipient_id bigint      not null references users(id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

-- 同一方向同一时间只允许一条待处理申请；拒绝后仍可重新申请。
create unique index if not exists friend_requests_pending_idx
  on friend_requests (sender_id, recipient_id) where status = 'pending';

create table if not exists direct_messages (
  id           bigserial   primary key,
  sender_id    bigint      not null references users(id) on delete cascade,
  recipient_id bigint      not null references users(id) on delete cascade,
  content      text        not null check (char_length(content) between 1 and 500),
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists direct_messages_pair_idx
  on direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), id desc);

-- ---------------------------------------------------------------- 联机协作
-- 曾经有 coop_presence / coop_rooms / coop_signals 三张表,用来做在线状态、
-- 房间和 WebRTC 信令 —— 那是部署在 serverless 上时的无奈之举:函数没有常驻内存,
-- 只能把本该是内存态的东西塞进数据库,再靠 3 秒一次的轮询去读。
--
-- 自托管之后改成了常驻的 WebSocket 进程(server/ws.mjs),这些状态回到了内存里,
-- 三张表随之废弃。老库里如果还有,可以手工 drop,留着也不影响。
