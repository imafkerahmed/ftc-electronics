import { redirect } from 'next/navigation';

export default function ChequesRedirectPage() {
  redirect('/admin/sales?view=cheques');
}
