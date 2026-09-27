'use client';

import React, { Suspense, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import SalesManagementTabs, { type SalesWorkspaceView } from '@/components/admin/sales-management/sales-management-tabs';
import SalesWorkspace from '@/components/admin/sales-management/sales-workspace';
import QuotationsWorkspace from '@/components/admin/sales-management/quotations-workspace';
import ReceivablesWorkspace from '@/components/admin/sales-management/receivables-workspace';
import ChequesWorkspace from '@/components/admin/sales-management/cheques-workspace';

function SalesManagementContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Determine current active view from URL search param
  const rawView = searchParams.get('view');
  const activeView: SalesWorkspaceView =
    rawView === 'quotations' || rawView === 'receivables' || rawView === 'cheques'
      ? rawView
      : 'sales';

  const initialSearch = searchParams.get('search') || undefined;
  const initialSaleId = searchParams.get('saleId') || searchParams.get('id') || undefined;

  // Handle Tab Change with URL preservation
  const handleViewChange = useCallback(
    (newView: SalesWorkspaceView) => {
      const params = new URLSearchParams();
      if (newView !== 'sales') {
        params.set('view', newView);
      }
      const queryString = params.toString();
      const url = queryString ? `${pathname}?${queryString}` : pathname;
      router.push(url);
    },
    [pathname, router]
  );

  // Cross-workspace navigation handler
  const handleNavigateTab = useCallback(
    (view: SalesWorkspaceView, extraParams?: { search?: string; id?: string }) => {
      const params = new URLSearchParams();
      if (view !== 'sales') {
        params.set('view', view);
      }
      if (extraParams?.search) {
        params.set('search', extraParams.search);
      }
      if (extraParams?.id) {
        params.set('saleId', extraParams.id);
      }
      const queryString = params.toString();
      const url = queryString ? `${pathname}?${queryString}` : pathname;
      router.push(url);
    },
    [pathname, router]
  );

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-6 pb-20">
      {/* Top Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Sales Management
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Consolidated commercial finance workspace for Invoices, Quotations, Outstanding Receivables, and Cheques.
          </p>
        </div>

        {/* Deep-linkable Navigation Tabs */}
        <SalesManagementTabs activeView={activeView} onViewChange={handleViewChange} />
      </div>

      {/* Strict Lazy-Loaded Active Workspace */}
      <div className="pt-2">
        {activeView === 'sales' && (
          <SalesWorkspace
            isActive={true}
            initialSearch={initialSearch}
            initialSaleId={initialSaleId}
            onNavigateTab={handleNavigateTab}
          />
        )}
        {activeView === 'quotations' && (
          <QuotationsWorkspace
            isActive={true}
            initialSearch={initialSearch}
            onNavigateTab={handleNavigateTab}
          />
        )}
        {activeView === 'receivables' && (
          <ReceivablesWorkspace
            isActive={true}
            initialSearch={initialSearch}
            onNavigateTab={handleNavigateTab}
          />
        )}
        {activeView === 'cheques' && (
          <ChequesWorkspace
            isActive={true}
            initialSearch={initialSearch}
            onNavigateTab={handleNavigateTab}
          />
        )}
      </div>
    </div>
  );
}

export default function AdminSalesManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-xs text-muted-foreground font-semibold">Loading Sales Management Workspace...</p>
          </div>
        </div>
      }
    >
      <SalesManagementContent />
    </Suspense>
  );
}
