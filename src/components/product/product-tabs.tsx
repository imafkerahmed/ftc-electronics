'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface ProductTabsProps {
  description: string;
  specs: Record<string, string>;
  currency?: 'USD' | 'LKR';
}

export default function ProductTabs({ description, specs }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'specs'>('details');

  const tabs = [
    { id: 'details', label: 'Description' },
    { id: 'specs', label: 'Specifications' },
  ] as const;

  return (
    <div className="w-full mt-10 border border-border bg-card/10 backdrop-blur-md rounded-2xl overflow-hidden shadow-xs">
      {/* Tabs list header */}
      <div className="flex border-b border-border bg-card/30">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex-1 py-4 text-sm font-semibold tracking-wider uppercase transition-colors cursor-pointer text-center outline-none select-none",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab contents panel */}
      <div className="p-6 md:p-8 min-h-[220px]">
        <AnimatePresence mode="wait">
          {activeTab === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <h4 className="text-base font-bold text-foreground">Product Overview</h4>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                {description}
              </p>
            </motion.div>
          )}

          {activeTab === 'specs' && (
            <motion.div
              key="specs"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {Object.entries(specs).map(([key, val]) => (
                <div 
                  key={key} 
                  className="p-4 rounded-xl border border-border/80 bg-card/20 backdrop-blur-xs hover:border-border hover:bg-card/40 transition-all group"
                >
                  <span className="block text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
                    {key}
                  </span>
                  <span className="text-sm font-semibold text-foreground group-hover:text-blue-500 transition-colors">
                    {val}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
