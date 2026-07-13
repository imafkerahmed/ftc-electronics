import React from 'react';

export default function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-border/40 bg-card/40 p-3.5 animate-pulse">
      <div className="aspect-square w-full rounded-xl bg-neutral-800/40" />
      <div className="mt-3 flex flex-col space-y-2">
        <div className="h-3 w-1/3 rounded bg-neutral-800/40" />
        <div className="h-4 w-5/6 rounded bg-neutral-800/40" />
        <div className="h-3 w-1/2 rounded bg-neutral-800/40" />
        <div className="mt-2 h-4 w-2/3 rounded bg-neutral-800/40" />
        <div className="mt-3 h-9 w-full rounded-xl bg-neutral-800/40" />
      </div>
    </div>
  );
}
