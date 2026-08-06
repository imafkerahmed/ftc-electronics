'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { Users, Search, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toggleCustomerStatusAction } from '@/app/actions/admin';
import PocketBase from 'pocketbase';

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { pb } = await import('@/lib/pocketbase');

      let records: any[] = [];
      try {
        records = await pb.collection('customers').getFullList({
          sort: '-created',
        });
      } catch {
        try {
          // Fallback if customers collection is empty or not yet seeded
          records = await pb.collection('users').getFullList({
            sort: '-created',
          });
        } catch (err) {
          console.warn('Customers/Users collection unavailable:', err);
        }
      }

      setCustomers(records.map((r: any) => ({
        id: r.id,
        name: r.name || 'Anonymous User',
        email: r.email || '',
        ordersCount: r.ordersCount || 0,
        totalSpent: r.totalSpent || 0,
        status: r.status === 'banned' ? 'banned' : 'active',
        joinedDate: new Date(r.created).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      })));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStatus = (id: string, currentStatus: 'active' | 'banned') => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await toggleCustomerStatusAction(id, currentStatus);
      if (res.success) {
        setSuccess('Customer account status updated successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to update customer account status.');
      }
    });
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

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
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
          <Users className="h-6 w-6 text-indigo-500" />
          Customers Manager
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Monitor storefront accounts, check order stats, or restrict user access permissions.
        </p>
      </div>

      {/* Query Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter customers by name or email..."
          className="pl-10 bg-card/40 border-border placeholder:text-muted-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Customers List Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading customer profiles...
            </div>
          ) : (
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
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground bg-card">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
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
          )}
        </div>
      </div>
    </div>
  );
}
