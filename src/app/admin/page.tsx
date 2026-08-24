import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import AdminDashboard from '@/components/AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect('/');
  return <AdminDashboard adminName={user.username} />;
}
