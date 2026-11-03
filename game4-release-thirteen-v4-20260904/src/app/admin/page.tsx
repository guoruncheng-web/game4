import { getCurrentUser } from '@/lib/session';
import AdminDashboard from '@/components/AdminDashboard';
import AdminAccess from '@/components/AdminAccess';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return <AdminAccess signedIn={Boolean(user)} username={user?.username} />;
  return <AdminDashboard adminName={user.username} />;
}
