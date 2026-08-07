'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Bell,
  MessageSquare,
  ShoppingCart,
  FileText,
  AlertTriangle,
  CheckCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { getAdminNotificationsAction, type AdminNotification } from '@/app/actions/admin';

export default function AdminNotificationBell() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'inquiry' | 'order' | 'quotation' | 'stock'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await getAdminNotificationsAction();
      if (res.success && res.notifications) {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err: unknown) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      void fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const filtered = notifications.filter((n) => (activeFilter === 'all' ? true : n.type === activeFilter));

  const getTimeAgo = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return '';
    }
  };

  const getIcon = (type: AdminNotification['type']) => {
    switch (type) {
      case 'inquiry':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'order':
        return <ShoppingCart className="h-4 w-4 text-emerald-500" />;
      case 'quotation':
        return <FileText className="h-4 w-4 text-purple-500" />;
      case 'stock':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
  };

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'inquiry', label: 'Inquiries' },
    { id: 'order', label: 'Orders' },
    { id: 'quotation', label: 'Quotations' },
    { id: 'stock', label: 'Stock' },
  ] as const;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all border border-border/50 bg-card/60"
        title="Admin Notifications"
        aria-label="Open Admin Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-sm ring-2 ring-background">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-card border border-border shadow-2xl z-50 overflow-hidden text-foreground animate-in fade-in zoom-in-95 duration-150">
          {/* Popover Header */}
          <div className="p-3.5 border-b border-border flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-foreground">System Notifications</h4>
                <p className="text-[10px] text-muted-foreground">Inquiries, Orders, Quotations &amp; Stock Alerts</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-blue-500 hover:underline font-semibold px-2 py-1 rounded-md hover:bg-blue-500/10 transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" /> Mark read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Close notifications"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 p-2 bg-muted/10 border-b border-border overflow-x-auto text-[11px]">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                aria-pressed={activeFilter === tab.id}
                className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                  activeFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
            {loading ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500 mx-auto" />
                <p className="text-xs text-muted-foreground">Checking notifications...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="h-6 w-6 text-muted-foreground/30 mx-auto" />
                <p className="text-xs font-semibold text-muted-foreground">No new notifications</p>
              </div>
            ) : (
              filtered.map((item) => (
                <Link
                  key={item.id}
                  href={item.link}
                  onClick={() => setIsOpen(false)}
                  className={`block p-3.5 hover:bg-muted/40 transition-colors ${
                    !item.read ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-card border border-border shrink-0 mt-0.5 shadow-2xs">
                      {getIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground truncate">{item.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{getTimeAgo(item.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
