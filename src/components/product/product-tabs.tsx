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
  let currentList: string[] = [];

  const flushParagraph = (key: string) => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join('\n');
      blocks.push(
        <p key={key} className="text-sm sm:text-base leading-relaxed text-muted-foreground/90 whitespace-pre-line max-w-3xl mx-auto text-center font-normal">
          {text}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushList = (key: string) => {
    if (currentList.length > 0) {
      blocks.push(
        <div key={key} className="my-4 w-full flex justify-center">
          <ul className="space-y-2.5 max-w-xl text-left bg-card/40 border border-border/60 p-4 sm:p-5 rounded-2xl backdrop-blur-xs">
            {currentList.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm sm:text-base text-foreground/90 font-medium">
                <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-2 shadow-xs shadow-blue-500/50" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
      currentList = [];
    }
  };

  const flushAll = (keyPrefix: string) => {
    flushParagraph(`${keyPrefix}-p`);
    flushList(`${keyPrefix}-l`);
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Image pattern: ![alt](url) or standalone image URL
    const mdImgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    const urlImgMatch = trimmed.match(/^(https?:\/\/.*\.(?:png|jpg|jpeg|webp|gif)(?:\?.*)?)$/i);

    if (mdImgMatch || urlImgMatch) {
      flushAll(`idx-${idx}`);
      const rawAlt = mdImgMatch ? mdImgMatch[1] : '';
      const src = mdImgMatch ? mdImgMatch[2] : urlImgMatch![1];
      const showCaption = Boolean(rawAlt && !['Product image', 'Product detail image', 'Product Image'].includes(rawAlt));

      blocks.push(
        <div key={`img-${idx}`} className="my-8 w-full max-w-4xl mx-auto flex flex-col items-center">
          <img 
            src={src} 
            alt={rawAlt || 'Product feature image'} 
            className="w-full h-auto max-h-[550px] object-contain rounded-2xl mx-auto transition-transform duration-300 hover:scale-[1.005]" 
          />
          {showCaption && (
            <p className="text-xs text-center text-muted-foreground mt-3 font-medium tracking-wide">
              {rawAlt}
            </p>
          )}
        </div>
      );
    } else if (trimmed.startsWith('# ')) {
      flushAll(`idx-${idx}`);
      blocks.push(
        <h2 key={`h1-${idx}`} className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight pt-6 pb-2 text-center max-w-3xl mx-auto">
          {trimmed.replace(/^#\s+/, '')}
        </h2>
      );
    } else if (trimmed.startsWith('## ')) {
      flushAll(`idx-${idx}`);
      blocks.push(
        <h3 key={`h2-${idx}`} className="text-lg sm:text-xl font-bold text-foreground tracking-tight pt-4 pb-1 text-center max-w-2xl mx-auto">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      );
    } else if (trimmed.startsWith('### ')) {
      flushAll(`idx-${idx}`);
      blocks.push(
        <h4 key={`h3-${idx}`} className="text-base font-semibold text-foreground tracking-tight pt-3 text-center max-w-xl mx-auto">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph(`idx-${idx}-p`);
      currentList.push(trimmed.replace(/^[-*]\s+/, ''));
    } else if (trimmed === '') {
      flushAll(`idx-${idx}`);
    } else {
      flushList(`idx-${idx}-l`);
      currentParagraph.push(line);
    }
  });

  flushAll('final');

  return <div className="space-y-5 flex flex-col items-center w-full">{blocks}</div>;
}

export default function ProductTabs({ description, specs }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'specs'>('details');

  const tabs = [
    { id: 'details', label: 'Description' },
    { id: 'specs', label: 'Specifications' },
  ] as const;

  return (
    <div className="w-full mt-10 border border-border/80 bg-card/20 backdrop-blur-md rounded-2xl overflow-hidden shadow-xs">
      {/* Tabs list header */}
      <div className="flex border-b border-border/80 bg-card/40">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex-1 py-4 text-xs sm:text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer text-center outline-none select-none",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-blue-500"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab contents panel */}
      <div className="p-6 md:p-10 min-h-[220px]">
        <AnimatePresence mode="wait">
          {activeTab === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-6 flex flex-col items-center text-center w-full"
            >
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
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto"
            >
              {Object.entries(specs).map(([key, val]) => (
                <div 
                  key={key} 
                  className="p-4 rounded-xl border border-border/80 bg-card/30 backdrop-blur-xs hover:border-border hover:bg-card/50 transition-all group"
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
