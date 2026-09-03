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

-- ---------------------------------------------------------------- 平台钱包与历史游戏钱包
-- 平台钻石是当前唯一持久货币。game_wallets / chip 流水仅为已上线版本的
-- 审计及在途房间收口保留；初始化不得再为新账号创建或赠送牌币。
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

insert into wallet_transactions
  (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
select 'welcome:platform:' || id, id, 'platform', null, 'diamond', 'grant', 10000,
  jsonb_build_object('reason', 'registration_welcome_v1')
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


-- ---------------------------------------------------------------- 自定义头像
-- users.avatar 仍是 emoji 兜底(注册就有,永远不为空)。上传的图片单独放这张表,
-- 原因是绝大多数查询(登录、好友列表、后台、ws 握手)都只需要那个 emoji,
-- 把几十 KB 的 bytea 混进 users 会让每一次 select * 级别的查询都白读一遍图。
--
-- **为什么存库而不是存磁盘**:部署是 rsync --delete 同步整个仓库目录,
-- 写进仓库里的上传文件下次部署就没了;写到仓库外(像 UMO_STATE_FILE 那样)
-- 则要在服务器上手工建目录、配环境变量、再让 rsync 排除 —— 多一步运维,
-- 而头像被限制在 256×256 / 200KB 以内,存库的代价小于那一步运维成本。
create table if not exists user_avatars (
  user_id    bigint      primary key references users(id) on delete cascade,
  mime       text        not null check (mime in ('image/webp', 'image/png', 'image/jpeg')),
  bytes      bytea       not null,
  width      integer     not null,
  height     integer     not null,
  updated_at timestamptz not null default now()
);

-- 头像版本号。它进 URL 的 query(/api/avatar/123456?v=3),
-- 于是图片本身可以发 immutable 长缓存,换头像又能立刻在所有端生效 ——
-- 没有这个版本号就只能给头像发 no-cache,每次列表滚动都要回源。
--
-- 编码方式:**正数 = 当前有自定义头像,绝对值是换过几次;<= 0 = 用 emoji**。
-- 删除头像时取负(-3)而不是清零,是因为幅度必须单调递增:
-- 清零的话下次再传又是 v=1,而浏览器里 ?v=1 那条 immutable 缓存还在,
-- 新头像会被旧图顶掉,而且这个缓存过不了期、用户自己刷新也没用。
alter table users add column if not exists avatar_version integer not null default 0;

-- ---------------------------------------------------------------- Thirteen 公平记录与玩家历史
-- result 只保存座位/名次/计分，不重复保存身份。身份单独放玩家表，注销时可原位匿名化，
-- 其他玩家的历史结果仍保持完整。seed 只在终局后落库并由历史接口公开。
create table if not exists thirteen_matches (
  id               bigserial   primary key,
  room_id          text        not null,
  match_number     integer     not null check (match_number > 0),
  rules_version    text        not null,
  economy_mode     text        not null check (economy_mode in ('free-v1', 'legacy-chip-stake')),
  commitment_version text      not null,
  deal_commitment  text        not null check (deal_commitment ~ '^[0-9a-f]{64}$'),
  seed_reveal      bigint      not null check (seed_reveal between 0 and 4294967295),
  deal_nonce_reveal text       not null check (deal_nonce_reveal ~ '^[0-9a-f]{32,128}$'),
  result           jsonb       not null,
  actions          jsonb       not null,
  completed_at     timestamptz not null default now(),
  unique (room_id, match_number)
);

create table if not exists thirteen_match_players (
  match_id      bigint   not null references thirteen_matches(id) on delete cascade,
  seat          smallint not null check (seat between 0 and 3),
  user_id       bigint   references users(id) on delete set null,
  public_uid    integer  check (public_uid between 100000 and 999999),
  display_name  text     not null check (char_length(display_name) between 1 and 32),
  avatar        text     not null default '',
  primary key (match_id, seat)
);

create index if not exists thirteen_match_players_user_idx
  on thirteen_match_players (user_id, match_id desc) where user_id is not null;

-- ---------------------------------------------------------------- 客服与申诉
create table if not exists support_requests (
  id          bigserial   primary key,
  user_id     bigint      references users(id) on delete set null,
  game_slug   text        not null,
  category    text        not null check (category in ('gameplay', 'fairness', 'account', 'privacy', 'technical', 'other')),
  message     text        not null check (char_length(message) between 1 and 1000),
  diagnostic  jsonb       not null default '{}'::jsonb,
  status      text        not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists support_requests_user_idx
  on support_requests (user_id, created_at desc) where user_id is not null;
