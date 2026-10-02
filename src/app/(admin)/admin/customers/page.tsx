'use client';

import React, { useState, useTransition } from 'react';
import { Users, Search, Mail, Loader2, CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toggleCustomerStatusAction, getAdminCustomersAction } from '@/app/actions/admin';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKeys } from '@/lib/query-keys';
import { useDebounce } from 'use-debounce';

interface Customer {
  id: string;
  name: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
  status: 'active' | 'banned';
  joinedDate: string;
}

export default function AdminCustomersPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch] = useDebounce(searchInput, 500);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const queryClient = useQueryClient();

  const { data: result, isLoading, isError, isFetching } = useQuery({
    queryKey: adminKeys.customers({ page, pageSize, search: debouncedSearch }),
    queryFn: async () => {
      const res = await getAdminCustomersAction({
        page,
        pageSize,
        search: debouncedSearch,
      });
      if (!res.success) throw new Error(res.error || 'Failed to fetch customers');
      return res;
    },
  });

  const customers = (result?.data || []).map((r: any) => {
    const rawDate = r.created_at || r.created;
    const parsedDate = rawDate ? new Date(rawDate) : new Date();
    const dateStr = !isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';

    return {
      id: r.id,
      name: r.name || 'Anonymous User',
      email: r.email || '',
      ordersCount: r.orders_count || r.ordersCount || 0,
      totalSpent: r.total_spent || r.totalSpent || 0,
      status: r.status === 'banned' ? 'banned' : 'active',
      joinedDate: dateStr,
    } as Customer;
  });

  const handleToggleStatus = (id: string, currentStatus: 'active' | 'banned') => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await toggleCustomerStatusAction(id, currentStatus);
      if (res.success) {
        setSuccess('Customer account status updated successfully.');
        queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
      } else {
        setError(res.error || 'Failed to update customer account status.');
      }
    });
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Feedback Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-500 text-xs">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-500 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Title */}
      <div className="border-b border-border pb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-500" />
            Customers Manager
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor storefront accounts, check order stats, or restrict user access permissions.
          </p>
        </div>
        {isFetching && !isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating...
          </div>
        )}
      </div>

      {/* Query Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter customers by name or email..."
          className="pl-10 bg-card/40 border-border placeholder:text-muted-foreground"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Customers List Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                <th className="p-4">Customer Name</th>
                <th className="p-4">Account Email</th>
                <th className="p-4">Joined Date</th>
                <th className="p-4">Orders Placed</th>
                <th className="p-4">Total Spent</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-sans text-muted-foreground">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading customer profiles...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-red-500">
                    Failed to load customers.
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground bg-card">
                    No customers found.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-4 font-bold text-foreground">{customer.name}</td>
                    <td className="p-4 font-mono text-muted-foreground flex items-center gap-1.5 pt-4">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/60" />
                      {customer.email}
                    </td>
                    <td className="p-4">{customer.joinedDate}</td>
                    <td className="p-4 text-foreground font-semibold">{customer.ordersCount} orders</td>
                    <td className="p-4 text-foreground font-black">${customer.totalSpent.toFixed(2)}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 border text-[9px] rounded font-bold uppercase tracking-wider ${
                          customer.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}
                      >
                        {customer.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleToggleStatus(customer.id, customer.status)}
                        className={`text-[10px] font-bold px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                          customer.status === 'active'
                            ? 'text-red-500 hover:text-red-400 hover:bg-red-500/10 border-border'
                            : 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 border-border'
                        }`}
                        disabled={isPending}
                      >
                        {customer.status === 'active' ? 'Suspend User' : 'Activate User'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {result?.totalPages ? (
          <div className="p-4 border-t border-border flex items-center justify-between bg-card text-xs">
            <div className="text-muted-foreground">
              Showing <span className="font-bold text-foreground">{(page - 1) * pageSize + 1}</span> to <span className="font-bold text-foreground">{Math.min(page * pageSize, result.total || 0)}</span> of <span className="font-bold text-foreground">{result.total}</span> customers
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <div className="px-3 py-1 bg-secondary/50 rounded font-mono text-xs font-bold">
                Page {page} of {result.totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setPage(p => Math.min(result.totalPages || 1, p + 1))}
                disabled={page === result.totalPages || isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
