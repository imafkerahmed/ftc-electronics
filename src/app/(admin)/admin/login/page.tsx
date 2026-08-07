import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '@/lib/utils';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const params = await searchParams;
  const target = getSafeRedirectUrl(params?.redirect, '/admin/dashboard');
  redirect(`/auth?redirect=${encodeURIComponent(target)}`);
}
