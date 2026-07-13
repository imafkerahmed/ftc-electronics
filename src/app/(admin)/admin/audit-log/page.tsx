'use client';

import React, { useState, useEffect } from 'react';
import { ScrollText, Search, User, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { pbAuditLog } from '@/lib/pb-collections';

interface AuditRecord {
  id: string;
  actor: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'publish' | 'unpublish';
  collection: string;
  recordId: string;
  ip: string;
  date: string;
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await pbAuditLog.getAll();
      setLogs((res?.items || []).map((l: any) => ({
        id: l.id,
        actor: l.actor || 'unknown',
        action: l.action || 'update',
        collection: l.collection || 'system',
        recordId: l.recordId || '-',
        ip: l.ip || '0.0.0.0',
        date: new Date(l.created).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })));
    } catch (err: any) {
      console.warn('Audit logs are empty or collection not created yet:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getActionBadge = (action: AuditRecord['action']) => {
    switch (action) {
      case 'create':
        return <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] rounded font-bold uppercase tracking-wider">Create</span>;
      case 'update':
        return <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] rounded font-bold uppercase tracking-wider">Update</span>;
      case 'delete':
        return <span className="px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] rounded font-bold uppercase tracking-wider">Delete</span>;
      case 'login':
        return <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-[9px] rounded font-bold uppercase tracking-wider">Login</span>;
      case 'logout':
        return <span className="px-2 py-0.5 bg-slate-500/10 text-slate-500 border border-slate-500/20 text-[9px] rounded font-bold uppercase tracking-wider">Logout</span>;
      default:
        return <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] rounded font-bold uppercase tracking-wider">{action}</span>;
    }
  };

  const filteredLogs = logs.filter((l) =>
    l.actor.toLowerCase().includes(search.toLowerCase()) ||
    l.collection.toLowerCase().includes(search.toLowerCase()) ||
    l.action.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-blue-500" />
          Audit & Activity Logs
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Chronological logs of merchant portal operations, catalog alterations, and auth attempts.
        </p>
      </div>

      {/* Query Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter logs by actor, collection name, or operation type..."
          className="pl-10 bg-card/40 border-border placeholder:text-muted-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Logs Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading audit trails...
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Actor</th>
                  <th className="p-4">Operation</th>
                  <th className="p-4">Affected Area</th>
                  <th className="p-4">Record ID</th>
                  <th className="p-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-muted-foreground text-[11px]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-muted-foreground font-sans bg-card">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/15 transition-colors">
                      <td className="p-4 text-foreground font-sans font-medium">{log.date}</td>
                      <td className="p-4 text-foreground flex items-center gap-1.5 font-sans font-semibold pt-4">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {log.actor}
                      </td>
                      <td className="p-4">{getActionBadge(log.action)}</td>
                      <td className="p-4 capitalize text-foreground font-sans font-medium">{log.collection}</td>
                      <td className="p-4 font-mono">{log.recordId}</td>
                      <td className="p-4">{log.ip}</td>
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
