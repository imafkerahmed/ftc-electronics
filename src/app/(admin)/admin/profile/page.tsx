import { redirect } from 'next/navigation';
import { getAdminCurrentSessionAction } from '@/app/actions/admin';
import ProfileView from './profile-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Administrator Profile | FTC Admin',
  description: 'Manage administrator Full Name and account profile details.',
};

export default async function AdminProfilePage() {
  const session = await getAdminCurrentSessionAction();

  if (!session.success || !session.user) {
    redirect('/admin/login');
  }

  return <ProfileView initialUser={session.user} />;
}
