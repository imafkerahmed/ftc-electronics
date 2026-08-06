import { redirect } from 'next/navigation';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const target = params?.redirect || '/admin/dashboard';
  redirect(`/auth?redirect=${encodeURIComponent(target)}`);
}
