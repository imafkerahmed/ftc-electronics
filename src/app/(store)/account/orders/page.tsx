import { getCustomerOrders } from '@/lib/auth-server';
import OrdersList from './orders-list';

export const dynamic = 'force-dynamic';

export default async function OrdersHistoryPage() {
  const res = await getCustomerOrders();
  return <OrdersList initialOrders={res.orders || []} initialError={res.error} />;
}
