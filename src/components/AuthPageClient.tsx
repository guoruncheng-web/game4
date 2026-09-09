'use client';

import { useRouter } from 'next/navigation';
import AuthDialog, { type AuthMode } from './AuthDialog';
import { useAuth } from './AuthProvider';
import { withGameCredentials } from '@/lib/api-client';

function safeNext(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth') ? value : '/';
}

export default function AuthPageClient({ initialMode, next }: { initialMode: AuthMode; next: string }) {
  const router = useRouter();
  const { user, credentials, completeAuth, logout } = useAuth();
  const resolvedMode: AuthMode = user ? 'account' : initialMode === 'account' ? 'login' : initialMode;

  function leave() {
    router.push(withGameCredentials(safeNext(next), credentials));
  }

  return (
    <div className="auth-world">
      <AuthDialog
        key={`${resolvedMode}:${user?.uid ?? 'guest'}`}
        presentation="page"
        initialMode={resolvedMode}
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
