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
