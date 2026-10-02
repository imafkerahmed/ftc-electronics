import { redirect } from 'next/navigation';
import { getCurrentUserSession } from '@/lib/auth-server';
import ProfileForm from './profile-form';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getCurrentUserSession();

  if (!session.success || !session.user) {
    redirect('/');
  }

  return <ProfileForm initialProfile={session.user} />;
}
