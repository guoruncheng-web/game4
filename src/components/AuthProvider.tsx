'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthDialog, { type AuthMode } from './AuthDialog';
import {
  apiFetch, setApiCredentials, type ApiCredentials, withGameCredentials,
} from '@/lib/api-client';
import { API_UID_HEADER } from '@/lib/api-contract';

export type AuthUser = { uid: number; username: string; avatar: string; isAdmin?: boolean } | null;

export type WalletSummary = {
  diamonds: number;
  thirteen: { chips: number; reserved: number; total: number };
};

type AuthContextValue = {
  user: AuthUser;
  credentials: ApiCredentials | null;
  wallet: WalletSummary | null;
  /** 首次 /me 还没回来。这一小段时间里别急着把界面渲染成"未登录",会闪 */
  loading: boolean;
  openPanel: (mode?: AuthMode) => void;
  logout: () => Promise<void>;
  updateAccessToken: (token: string) => void;
  refreshWallet: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须放在 AuthProvider 里面');
  return value;
}

/**
 * 全站唯一的登录状态来源。
 *
 * 挂在 layout 里,`/api/auth/me` 整站只请求一次 —— 头部的账号按钮和首页的游戏卡片
 * 都要看登录态,各自 fetch 一遍既浪费也会互相打架。
 *
 * 弹窗本体在 AuthDialog,这里只管状态和"登录成功之后该去哪"。
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>(null);
  const [credentials, setCredentials] = useState<ApiCredentials | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  /** null = 关着 */
  const [mode, setMode] = useState<AuthMode | null>(null);
  /** 被 middleware 弹回来时记下他本来要去哪,登录完自动送过去 */
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const linkedUid = params.get('uid');
    const linkedToken = params.get('token');
    fetch('/api/auth/me', {
      headers: linkedUid && linkedToken ? {
        [API_UID_HEADER]: linkedUid,
        Authorization: `Bearer ${linkedToken}`,
      } : undefined,
    })
      .then((res) => res.json())
      .then((data: { user: AuthUser; token?: string | null }) => {
        if (cancelled) return;
        setUser(data.user);
        const next = data.user && data.token ? { uid: data.user.uid, token: data.token } : null;
        setCredentials(next);
        setApiCredentials(next);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; setApiCredentials(null); };
  }, []);

  // middleware 拦下未登录的游戏路由后会带 ?login=1&from=/xxx 弹回首页。
  // 读 URL 是同步的,但 setState 要挪到下一拍 —— effect 体内直接 setState 会被
  // react-hooks/set-state-in-effect 拦下(首页读 localStorage 那处也是这么写的)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') !== '1') return undefined;
    const from = params.get('from');
    // 把 query 抹掉,否则刷新一次弹一次
    window.history.replaceState(null, '', window.location.pathname);
    const timer = window.setTimeout(() => {
      // 只认站内路径,别让 ?from=//evil.com 变成开放重定向
      if (from && from.startsWith('/') && !from.startsWith('//')) setRedirectTo(from);
      setMode('register');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openPanel = useCallback((next: AuthMode = 'register') => setMode(next), []);

  const refreshWallet = useCallback(async () => {
    if (!credentials) return;
    const response = await apiFetch('/api/wallet', { cache: 'no-store' });
    if (!response.ok) throw new Error('wallet_refresh_failed');
    const data = await response.json() as {
      diamonds: number;
      games: { thirteen: { chips: number; reserved: number; total: number } };
    };
    if (!Number.isSafeInteger(data.diamonds) || data.diamonds < 0
      || !Number.isSafeInteger(data.games?.thirteen?.chips) || data.games.thirteen.chips < 0
      || !Number.isSafeInteger(data.games.thirteen.reserved) || data.games.thirteen.reserved < 0
      || !Number.isSafeInteger(data.games.thirteen.total) || data.games.thirteen.total < 0) {
      throw new Error('invalid_wallet_payload');
    }
    setWallet({ diamonds: data.diamonds, thirteen: data.games.thirteen });
  }, [credentials]);

  useEffect(() => {
    if (!credentials) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void refreshWallet().catch(() => {
        if (!cancelled) setWallet(null);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [credentials, refreshWallet]);

  useEffect(() => {
    function onWalletUpdated(event: Event) {
      const value = (event as CustomEvent<unknown>).detail as {
        diamonds?: unknown; chips?: unknown; reserved?: unknown; totalChips?: unknown;
      } | null;
      if (!value || !Number.isSafeInteger(value.diamonds) || Number(value.diamonds) < 0
        || !Number.isSafeInteger(value.chips) || Number(value.chips) < 0
        || !Number.isSafeInteger(value.reserved) || Number(value.reserved) < 0
        || !Number.isSafeInteger(value.totalChips) || Number(value.totalChips) < 0) return;
      setWallet({
        diamonds: Number(value.diamonds),
        thirteen: {
          chips: Number(value.chips), reserved: Number(value.reserved), total: Number(value.totalChips),
        },
      });
    }
    window.addEventListener('game4:wallet-updated', onWalletUpdated);
    return () => window.removeEventListener('game4:wallet-updated', onWalletUpdated);
  }, []);

  const handleAuthed = useCallback((nextUser: Exclude<AuthUser, null>, token: string) => {
    const nextCredentials = { uid: nextUser.uid, token };
    setUser(nextUser);
    setCredentials(nextCredentials);
    setApiCredentials(nextCredentials);
    // /admin 是服务端权限页，登录成功后立即让它重新读取新会话。
    router.refresh();
  }, [router]);

  const updateAccessToken = useCallback((token: string) => {
    if (!user) return;
    const nextCredentials = { uid: user.uid, token };
    setCredentials(nextCredentials);
    setApiCredentials(nextCredentials);
  }, [user]);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setCredentials(null);
    setWallet(null);
    setApiCredentials(null);
    setMode(null);
    // 可能正站在需要登录的页面上,刷一下让 middleware 把人送回首页
    router.refresh();
  }, [router]);

  /** Dialog 认为可以关了才会调到这里(注册凭据没确认保存时它不会调) */
  const handleClose = useCallback(() => {
    setMode(null);
    if (redirectTo && user) {
      const target = redirectTo;
      setRedirectTo(null);
      router.push(withGameCredentials(target, credentials));
    }
  }, [credentials, redirectTo, user, router]);

  const value = useMemo(
    () => ({ user, credentials, wallet, loading, openPanel, logout, updateAccessToken, refreshWallet }),
    [user, credentials, wallet, loading, openPanel, logout, updateAccessToken, refreshWallet],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {mode && (
        <AuthDialog
          initialMode={mode}
          user={user}
          onAuthed={handleAuthed}
          onClose={handleClose}
          onLogout={logout}
        />
      )}
    </AuthContext.Provider>
  );
}
