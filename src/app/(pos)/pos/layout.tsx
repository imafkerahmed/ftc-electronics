import React from 'react';

export const metadata = {
  title: 'POS Terminal — FTC Electronics',
  description: 'In-store cashier point-of-sale terminal for FTC Electronics',
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-blue-500/20">
      {children}
    </div>
  );
}
