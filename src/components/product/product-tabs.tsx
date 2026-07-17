'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface ProductTabsProps {
  description: string;
  specs: Record<string, string>;
  currency?: 'USD' | 'LKR';
}

function RichDescriptionRenderer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentParagraph: string[] = [];

  const flushParagraph = (key: string) => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join('\n');
      blocks.push(
        <p key={key} className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {text}
        </p>
      );
      currentParagraph = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Image pattern: ![alt](url) or standalone image URL
    const mdImgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    const urlImgMatch = trimmed.match(/^(https?:\/\/.*\.(?:png|jpg|jpeg|webp|gif)(?:\?.*)?)$/i);

    if (mdImgMatch || urlImgMatch) {
      flushParagraph(`p-${idx}`);
      const alt = mdImgMatch ? mdImgMatch[1] : 'Product detail image';
      const src = mdImgMatch ? mdImgMatch[2] : urlImgMatch![1];

      blocks.push(
        <div key={`img-${idx}`} className="my-6 relative w-full max-w-3xl rounded-2xl overflow-hidden border border-border bg-neutral-950 p-2 shadow-md">
          <img src={src} alt={alt} className="w-full h-auto max-h-[500px] object-contain rounded-xl mx-auto" />
          {alt && alt !== 'Product detail image' && (
            <p className="text-[11px] text-center text-muted-foreground mt-2 italic font-medium">{alt}</p>
          )}
        </div>
      );
    } else if (trimmed.startsWith('# ')) {
      flushParagraph(`p-${idx}`);
      blocks.push(
        <h2 key={`h1-${idx}`} className="text-xl sm:text-2xl font-black text-foreground tracking-tight pt-4 pb-2 border-b border-border/40">
          {trimmed.replace(/^#\s+/, '')}
        </h2>
      );
    } else if (trimmed.startsWith('## ')) {
      flushParagraph(`p-${idx}`);
      blocks.push(
        <h3 key={`h2-${idx}`} className="text-lg font-extrabold text-foreground tracking-tight pt-3 pb-1">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      );
    } else if (trimmed.startsWith('### ')) {
      flushParagraph(`p-${idx}`);
      blocks.push(
        <h4 key={`h3-${idx}`} className="text-base font-bold text-foreground tracking-tight pt-2">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph(`p-${idx}`);
      blocks.push(
        <li key={`li-${idx}`} className="text-sm text-muted-foreground list-disc ml-5 pl-1 my-1">
          {trimmed.replace(/^[-*]\s+/, '')}
        </li>
      );
    } else if (trimmed === '') {
      flushParagraph(`p-${idx}`);
    } else {
      currentParagraph.push(line);
    }
  });

  flushParagraph('p-final');

  return <div className="space-y-4">{blocks}</div>;
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
              <RichDescriptionRenderer content={description} />
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
