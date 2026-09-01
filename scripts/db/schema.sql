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

-- 面向玩家与游戏公开的六位数字身份标识。数据库内部仍用 bigserial id 做外键，
-- uid 只用于用户展示、PWA API 与游戏接入，避免把内部表主键暴露给客户端。
-- 老账号首次迁移时从尚未占用的六位数中顺序回填；新账号由注册接口随机生成。
alter table users add column if not exists uid integer;

with missing as (
  select id, row_number() over (order by id) as sequence
  from users
  where uid is null
), available as (
  select candidate, row_number() over (order by candidate) as sequence
  from generate_series(100000, 999999) as candidate
  where not exists (select 1 from users where uid = candidate)
)
update users
set uid = available.candidate
from missing
join available using (sequence)
where users.id = missing.id;

alter table users alter column uid set not null;
alter table users drop constraint if exists users_uid_six_digits_check;
alter table users add constraint users_uid_six_digits_check check (uid between 100000 and 999999);
create unique index if not exists users_uid_unique_idx on users (uid);

-- 每个账号都有一个可直接展示的头像。先用 emoji 做默认头像；以后开放换头像时，
-- 仍然复用这个字段，不需要让前端根据用户名临时猜一个。
alter table users add column if not exists avatar text not null default '🎮';
alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists suspended_at timestamptz;

-- 早期账号都拿到同一个 🎮。按稳定的用户 ID 分散到头像池，执行多次结果不变；
-- 新账号由注册接口随机挑选并直接写库。
update users
set avatar = (array['🐯','🦊','🐼','🐨','🐸','🦁','🐵','🐰','🐙','🦄','🐲','👾'])[(mod(id, 12) + 1)::integer]
where avatar = '🎮';

-- 登录时按用户名精确查,用户名统一小写存,唯一索引已经够用
create index if not exists users_created_at_idx on users (created_at desc);

-- ---------------------------------------------------------------- 双层钱包
-- 平台钻石与具体游戏的牌注严格分表；余额只由服务端事务改写，客户端只显示快照。
create table if not exists platform_wallets (
  user_id             bigint      primary key references users(id) on delete cascade,
  diamonds_available  bigint      not null default 0 check (diamonds_available >= 0),
  updated_at           timestamptz not null default now()
);

create table if not exists game_wallets (
  user_id          bigint      not null references users(id) on delete cascade,
  game_slug        text        not null,
  balance          bigint      not null default 0 check (balance >= 0),
  reserved         bigint      not null default 0 check (reserved >= 0),
  updated_at       timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create table if not exists wallet_transactions (
  id                 bigserial   primary key,
  idempotency_key    text        not null unique,
  user_id            bigint      not null references users(id) on delete cascade,
  scope              text        not null check (scope in ('platform', 'game')),
  game_slug          text,
  currency           text        not null check (currency in ('diamond', 'chip')),
  kind               text        not null check (kind in ('grant', 'exchange_debit', 'exchange_credit', 'reserve', 'refund', 'settle')),
  available_delta    bigint      not null default 0,
  reserved_delta     bigint      not null default 0,
  metadata           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  check ((scope = 'platform' and game_slug is null) or (scope = 'game' and game_slug is not null))
);

create index if not exists wallet_transactions_user_idx
  on wallet_transactions (user_id, created_at desc, id desc);

-- 老账号与未来被其他受控流程创建的账号都获得同样的一次性欢迎额度。
insert into platform_wallets (user_id, diamonds_available)
select id, 10000 from users
on conflict (user_id) do nothing;

insert into game_wallets (user_id, game_slug, balance, reserved)
select id, 'thirteen', 10000, 0 from users
on conflict (user_id, game_slug) do nothing;

insert into wallet_transactions
  (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
select 'welcome:platform:' || id, id, 'platform', null, 'diamond', 'grant', 10000,
  jsonb_build_object('reason', 'registration_welcome_v1')
from users
on conflict (idempotency_key) do nothing;

insert into wallet_transactions
  (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
select 'welcome:thirteen:' || id, id, 'game', 'thirteen', 'chip', 'grant', 10000,
  jsonb_build_object('reason', 'first_entry_welcome_v1')
from users
on conflict (idempotency_key) do nothing;

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

alter table direct_messages add column if not exists read_at timestamptz;

create index if not exists direct_messages_pair_idx
  on direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), id desc);

-- ---------------------------------------------------------------- 后台游戏配置
-- 代码仍是游戏元数据的来源；这里仅保存运营态（上下架与排序）。
create table if not exists game_settings (
  slug         text        primary key,
  enabled      boolean     not null default true,
  sort_order   integer     not null default 0,
  updated_at   timestamptz not null default now()
);

insert into game_settings (slug, sort_order) values
  ('star-runner', 10),
  ('fruit-slasher', 20),
  ('neon-strike', 30),
  ('neon-strike-2d', 40),
  ('eight-ball', 50),
  ('triple-pile', 60),
  ('fish-hunter', 70),
  ('ludo', 80)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------- 联机协作
-- 曾经有 coop_presence / coop_rooms / coop_signals 三张表,用来做在线状态、
-- 房间和 WebRTC 信令 —— 那是部署在 serverless 上时的无奈之举:函数没有常驻内存,
-- 只能把本该是内存态的东西塞进数据库,再靠 3 秒一次的轮询去读。
--
-- 自托管之后改成了常驻的 WebSocket 进程(server/ws.mjs),这些状态回到了内存里,
-- 三张表随之废弃。老库里如果还有,可以手工 drop,留着也不影响。
