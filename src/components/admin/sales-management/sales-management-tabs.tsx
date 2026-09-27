'use client';

import React from 'react';
import { ScrollText, FileText, Receipt, Landmark } from 'lucide-react';

export type SalesWorkspaceView = 'sales' | 'quotations' | 'receivables' | 'cheques';

interface SalesManagementTabsProps {
  activeView: SalesWorkspaceView;
  onViewChange: (view: SalesWorkspaceView) => void;
}

const TABS: { id: SalesWorkspaceView; label: string; description: string; icon: React.ElementType }[] = [
  {
    id: 'sales',
    label: 'Sales',
    description: 'Invoices, POS, Wholesale & Payment Statuses',
    icon: ScrollText,
  },
  {
    id: 'quotations',
    label: 'Quotations',
    description: 'B2B Quotes, Estimates & Invoice Issuance',
    icon: FileText,
  },
  {
    id: 'receivables',
    label: 'Receivables',
    description: 'Outstanding Collections & Aging Tracking',
    icon: Receipt,
  },
  {
    id: 'cheques',
    label: 'Cheques',
    description: 'Cheque Register & Clearance Lifecycle',
    icon: Landmark,
  },
];

export default function SalesManagementTabs({
  activeView,
  onViewChange,
}: SalesManagementTabsProps) {
  return (
    <div className="w-full">
      {/* Responsive Horizontal Scroll Container */}
      <div className="flex items-center gap-1.5 p-1.5 bg-card/80 backdrop-blur-md border border-border/70 rounded-2xl overflow-x-auto no-scrollbar shadow-xs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onViewChange(tab.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer select-none shrink-0 ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
              title={tab.description}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={`h-4 w-4 shrink-0 transition-transform ${isActive ? 'scale-110 text-white' : 'opacity-70'}`} />
              <span>{tab.label}</span>
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
