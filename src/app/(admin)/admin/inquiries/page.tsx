'use client';

import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Search,
  RefreshCw,
  Mail,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Eye,
  Send,
  User,
  Filter,
  FileSpreadsheet,
  Loader2,
  FileText,
  CornerUpLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getInquiriesAction,
  updateInquiryStatusAction,
  deleteInquiryAction,
} from '@/app/actions/contact';
import type { PBContactInquiry, InquiryStatus } from '@/types/admin';

export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = useState<PBContactInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<PBContactInquiry | null>(null);
  const [adminNotesInput, setAdminNotesInput] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchInquiries = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getInquiriesAction();
      if (res.success && res.inquiries) {
        setInquiries(res.inquiries);
      }
    } catch (err) {
      console.error('Failed to load inquiries:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchInquiries();
  }, []);

  const handleStatusUpdate = async (id: string, status: InquiryStatus, notes?: string) => {
    setUpdatingId(id);
    try {
      const res = await updateInquiryStatusAction(id, status, notes);
      if (res.success && res.inquiry) {
        setInquiries((prev) => prev.map((item) => (item.id === id ? res.inquiry! : item)));
        if (selectedInquiry?.id === id) {
          setSelectedInquiry(res.inquiry);
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this customer inquiry?')) return;
    setDeletingId(id);
    try {
      const res = await deleteInquiryAction(id);
      if (res.success) {
        setInquiries((prev) => prev.filter((item) => item.id !== id));
        if (selectedInquiry?.id === id) {
          setSelectedInquiry(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete inquiry:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered inquiries
  const filteredInquiries = inquiries.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.phone && item.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.message.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  // Metrics
  const totalCount = inquiries.length;
  const newCount = inquiries.filter((i) => i.status === 'new').length;
  const inProgressCount = inquiries.filter((i) => i.status === 'in-progress').length;
  const resolvedCount = inquiries.filter((i) => i.status === 'resolved').length;

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'Name', 'Email', 'Phone', 'Message', 'Status', 'Notes'];
    const rows = filteredInquiries.map((i) => [
      i.id,
      new Date(i.created).toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.email.replace(/"/g, '""')}"`,
      `"${(i.phone || '').replace(/"/g, '""')}"`,
      `"${i.message.replace(/"/g, '""')}"`,
      i.status,
      `"${(i.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `customer_inquiries_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openDetailsModal = (inquiry: PBContactInquiry) => {
    setSelectedInquiry(inquiry);
    setAdminNotesInput(inquiry.notes || '');
    if (inquiry.status === 'new') {
      void handleStatusUpdate(inquiry.id, 'in-progress');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
            <MessageSquare className="h-7 w-7 text-blue-500" /> Customer Contact Inquiries
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage, respond to, and track incoming customer inquiries submitted via the website contact form.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchInquiries(true)}
            disabled={refreshing}
            className="text-xs gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold">{totalCount}</div>
            <div className="text-xs text-muted-foreground">Total Inquiries</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-500">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-sky-500">{newCount}</div>
            <div className="text-xs text-muted-foreground">New Unread</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-amber-500">{inProgressCount}</div>
            <div className="text-xs text-muted-foreground">In Progress</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-sm">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-500">{resolvedCount}</div>
            <div className="text-xs text-muted-foreground">Resolved</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by name, email, phone or message content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-muted-foreground font-semibold mr-1 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Filter:
          </span>
          {[
            { id: 'all', label: 'All' },
            { id: 'new', label: 'New' },
            { id: 'in-progress', label: 'In Progress' },
            { id: 'resolved', label: 'Resolved' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedStatus === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-xs text-muted-foreground">Loading customer inquiries...</p>
          </div>
        ) : filteredInquiries.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <h3 className="text-sm font-bold">No Inquiries Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery || selectedStatus !== 'all'
                ? 'No messages match your search filter criteria.'
                : 'Customer inquiries submitted via the website contact form will appear here automatically.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Customer Details</th>
                  <th className="py-3 px-4">Message Snippet</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="py-3.5 px-4 whitespace-nowrap text-muted-foreground">
                      <div className="font-semibold text-foreground">
                        {new Date(inquiry.created).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-[11px]">
                        {new Date(inquiry.created).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-foreground">{inquiry.name}</div>
                      <div className="text-blue-500 hover:underline">
                        <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
                      </div>
                      {inquiry.phone && (
                        <div className="text-muted-foreground text-[11px] mt-0.5">Phone: {inquiry.phone}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="line-clamp-2 text-foreground/90 leading-relaxed">{inquiry.message}</p>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {inquiry.status === 'new' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20 font-bold text-[11px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-ping" /> New
                        </span>
                      )}
                      {inquiry.status === 'in-progress' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-[11px]">
                          <Clock className="h-3 w-3" /> In Progress
                        </span>
                      )}
                      {inquiry.status === 'resolved' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-[11px]">
                          <CheckCircle2 className="h-3 w-3" /> Resolved
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetailsModal(inquiry)}
                          className="h-8 px-2.5 text-xs gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5 text-blue-500" /> View
                        </Button>

                        <a
                          href={`mailto:${inquiry.email}?subject=RE: Inquiry to FTC Electronics&body=%0A%0A--- Original Inquiry ---%0AFrom: ${inquiry.name}%0AMessage: ${encodeURIComponent(inquiry.message)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Reply via Email">
                            <Mail className="h-3.5 w-3.5 text-emerald-500" />
                          </Button>
                        </a>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(inquiry.id)}
                          disabled={deletingId === inquiry.id}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          title="Delete Inquiry"
                        >
                          {deletingId === inquiry.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details View Modal */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">Inquiry Details</span>
                <h3 className="text-xl font-bold text-foreground mt-0.5">{selectedInquiry.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Received on {new Date(selectedInquiry.created).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedInquiry(null)}
                className="h-8 w-8 rounded-full p-0"
              >
                ✕
              </Button>
            </div>

            {/* Customer Info Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-muted/30 border border-border text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-blue-500" /> Email Address
                </span>
                <div className="font-bold text-foreground">
                  <a href={`mailto:${selectedInquiry.email}`} className="hover:underline">
                    {selectedInquiry.email}
                  </a>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-emerald-500" /> Phone Number
                </span>
                <div className="font-bold text-foreground">
                  {selectedInquiry.phone ? (
                    <a href={`tel:${selectedInquiry.phone}`} className="hover:underline">
                      {selectedInquiry.phone}
                    </a>
                  ) : (
                    'Not provided'
                  )}
                </div>
              </div>
            </div>

            {/* Full Message */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message Content</span>
              <div className="p-4 rounded-2xl bg-background border border-border text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {selectedInquiry.message}
              </div>
            </div>

            {/* Internal Admin Notes */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Internal Admin Notes</span>
              <textarea
                rows={2}
                placeholder="Add internal notes about this inquiry..."
                value={adminNotesInput}
                onChange={(e) => setAdminNotesInput(e.target.value)}
                className="w-full rounded-2xl border border-border bg-background p-3 text-xs text-foreground focus:outline-none focus:border-blue-500"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusUpdate(selectedInquiry.id, selectedInquiry.status, adminNotesInput)}
                disabled={updatingId === selectedInquiry.id}
                className="text-xs gap-1.5"
              >
                {updatingId === selectedInquiry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Admin Notes
              </Button>
            </div>

            {/* Status Management Bar & Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-bold text-muted-foreground">Set Status:</span>
                <Button
                  size="sm"
                  variant={selectedInquiry.status === 'new' ? 'default' : 'outline'}
                  onClick={() => handleStatusUpdate(selectedInquiry.id, 'new', adminNotesInput)}
                  className="text-xs h-8"
                >
                  New
                </Button>
                <Button
                  size="sm"
                  variant={selectedInquiry.status === 'in-progress' ? 'default' : 'outline'}
                  onClick={() => handleStatusUpdate(selectedInquiry.id, 'in-progress', adminNotesInput)}
                  className="text-xs h-8"
                >
                  In Progress
                </Button>
                <Button
                  size="sm"
                  variant={selectedInquiry.status === 'resolved' ? 'default' : 'outline'}
                  onClick={() => handleStatusUpdate(selectedInquiry.id, 'resolved', adminNotesInput)}
                  className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Resolved
                </Button>
              </div>

              <a
                href={`mailto:${selectedInquiry.email}?subject=RE: Inquiry to FTC Electronics&body=%0A%0A--- Original Inquiry ---%0AFrom: ${selectedInquiry.name}%0AMessage: ${encodeURIComponent(selectedInquiry.message)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-500 text-white gap-2">
                  <Send className="h-3.5 w-3.5" /> Reply to Customer
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
