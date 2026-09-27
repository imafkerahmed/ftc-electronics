import { redirect } from 'next/navigation';

export default function QuotationsRedirectPage() {
  redirect('/admin/sales?view=quotations');
}
