'use client';

import { useRouter } from 'next/navigation';
import AuthDialog, { type AuthMode } from './AuthDialog';
import { useAuth } from './AuthProvider';
import { withGameCredentials, type ApiCredentials } from '@/lib/api-client';

function safeNext(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth') ? value : '/';
}

export default function AuthPageClient({ initialMode, next, initialSetup = false }: { initialMode: AuthMode; next: string; initialSetup?: boolean }) {
  const router = useRouter();
  const { user, credentials, completeAuth, logout, loading } = useAuth();
  const resolvedMode: AuthMode = user ? 'account' : initialMode === 'account' ? 'login' : initialMode;

  function leave(freshCredentials?: ApiCredentials) {
    // 改密使旧 token 失效，必须使用刚签发的 token，不能等下一次 Context 渲染。
    router.replace(withGameCredentials(safeNext(next), freshCredentials ?? credentials));
  }

  if (loading) return <div className="gb-auth-world"><div className="gb-auth-form-page" role="status" aria-label="正在恢复登录状态" /></div>;

  return (
    <div className="gb-auth-world">
      <AuthDialog
        presentation="page"
        initialMode={resolvedMode}
        initialSetup={initialSetup}
        onRegistered={() => {
          const url = new URL(window.location.href);
          url.searchParams.set('mode', 'account');
          url.searchParams.set('setup', '1');
          window.history.replaceState(null, '', url);
        }}
        user={user}
        onAuthed={completeAuth}
        onClose={leave}
        onLogout={async () => {
          await logout();
          router.replace('/auth?mode=login');
        }}
      />
    </div>
  );
}
