import type { AuthMode } from '@/components/AuthDialog';
import AuthPageClient from '@/components/AuthPageClient';
import { registrationMode } from '@/lib/registration';

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode: AuthMode = registrationMode(requested === 'register' || requested === 'account' ? requested : 'login');
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  return <AuthPageClient initialMode={initialMode} initialSetup={params.setup === '1'} next={rawNext ?? '/'} />;
}
