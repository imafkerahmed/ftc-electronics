import { redirect } from 'next/navigation';

export default function ReceivablesRedirectPage() {
  redirect('/admin/sales?view=receivables');
}
