'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  FileText,
  DollarSign,
  TrendingUp,
  X,
  Printer,
  History,
  Phone,
  Mail,
  MapPin,
  Percent,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getWholesaleDealersAction,
  saveWholesaleDealerAction,
  deleteWholesaleDealerAction,
  getDealerPurchaseHistoryAction,
  getInvoicePrintPresetsAction,
} from '@/app/actions/admin';
import { printInvoice } from '@/lib/invoice-print';
import type { PBWholesaleDealer } from '@/types/admin';

export default function WholesaleDealersPage() {
  const [dealers, setDealers] = useState<PBWholesaleDealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPending, startTransition] = useTransition();

  // Toast state
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Add/Edit Dealer Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDealer, setEditingDealer] = useState<PBWholesaleDealer | null>(null);
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    tax_id: '',
    address: '',
    discount_rate: '0',
    credit_limit: '0',
    status: 'active' as 'active' | 'pending' | 'suspended',
    notes: '',
  });

  // History slide-over modal state
  const [selectedDealerHistory, setSelectedDealerHistory] = useState<PBWholesaleDealer | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<PBWholesaleDealer | null>(null);

  // Load dealers
  const loadDealers = async () => {
    setLoading(true);
    const res = await getWholesaleDealersAction();
    if (res.success && res.data) {
      setDealers(res.data);
    } else {
      showToast(res.error || 'Failed to load wholesale dealers.', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadDealers();
  }, []);

  // Filtered dealers
  const filteredDealers = dealers.filter((d) => {
    const matchesSearch =
      d.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.includes(search);
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Handle open create/edit modal
  const handleOpenModal = (dealer?: PBWholesaleDealer) => {
    if (dealer) {
      setEditingDealer(dealer);
      setFormData({
        company_name: dealer.company_name || '',
        contact_name: dealer.contact_name || '',
        email: dealer.email || '',
        phone: dealer.phone || '',
        tax_id: dealer.tax_id || '',
        address: dealer.address || '',
        discount_rate: (dealer.discount_rate || 0).toString(),
        credit_limit: (dealer.credit_limit || 0).toString(),
        status: dealer.status || 'active',
        notes: dealer.notes || '',
      });
    } else {
      setEditingDealer(null);
      setFormData({
        company_name: '',
        contact_name: '',
        email: '',
        phone: '',
        tax_id: '',
        address: '',
        discount_rate: '5',
        credit_limit: '500000',
        status: 'active',
        notes: '',
      });
    }
    setIsModalOpen(true);
  };

  // Handle Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const payload = {
        company_name: formData.company_name.trim(),
        contact_name: formData.contact_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        tax_id: formData.tax_id.trim(),
        address: formData.address.trim(),
        discount_rate: parseFloat(formData.discount_rate) || 0,
        credit_limit: parseFloat(formData.credit_limit) || 0,
        status: formData.status,
        notes: formData.notes.trim(),
      };

      const res = await saveWholesaleDealerAction(payload, editingDealer?.id);
      if (res.success) {
        showToast(editingDealer ? 'Dealer updated successfully!' : 'Wholesale dealer added!');
        setIsModalOpen(false);
        void loadDealers();
      } else {
        showToast(res.error || 'Failed to save dealer.', 'error');
      }
    });
  };

  // Handle Delete
  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteWholesaleDealerAction(deleteTarget.id);
      if (res.success) {
        showToast('Wholesale dealer removed.');
        setDeleteTarget(null);
        void loadDealers();
      } else {
        showToast(res.error || 'Failed to delete dealer.', 'error');
      }
    });
  };

  // Handle View Purchase History
  const handleViewHistory = async (dealer: PBWholesaleDealer) => {
    setSelectedDealerHistory(dealer);
    setHistoryLoading(true);
    const res = await getDealerPurchaseHistoryAction(dealer.email, dealer.phone, dealer.company_name);
    if (res.success && res.data) {
      setPurchaseHistory(res.data);
    } else {
      setPurchaseHistory([]);
    }
    setHistoryLoading(false);
  };

  // Print Invoice for a History item
  const handlePrintHistoryInvoice = async (sale: any) => {
    const presetsRes = await getInvoicePrintPresetsAction();
    const presets = presetsRes.success && presetsRes.data ? presetsRes.data : [];
    const defaultPreset = presets.find((p: any) => p.isDefault) || presets[0];

    const cfg = defaultPreset
      ? typeof defaultPreset.config === 'string'
        ? JSON.parse(defaultPreset.config)
        : defaultPreset.config
      : {
          label: 'Default A4 Invoice',
          paperWidthMm: 210,
          fontSizeMm: 3.5,
          documentTitle: 'INVOICE',
          storeName: 'FTC Electronics',
          headerAddress: 'Main Street, Colombo, Sri Lanka',
          headerPhone: '+94 77 123 4567',
          headerEmail: 'info@ftc.lk',
          taxNumber: 'VAT Reg: 123456789-0000',
          bankDetailsText: 'Bank: Commercial Bank | Account: 1000293847',
          termsAndConditions: 'Warranty claims require original invoice copy.',
          showTaxBreakdown: true,
          showDueDate: true,
          showSignatureBlock: true,
          showQrCode: true,
          isDefault: true,
        };

    const invoiceData = {
      docType: 'Invoice' as const,
      docNumber: sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`,
      date: new Date(sale.date || sale.created).toLocaleDateString(),
      customerName: sale.customer_name || selectedDealerHistory?.company_name,
      customerCompany: selectedDealerHistory?.company_name,
      customerPhone: sale.customer_phone || selectedDealerHistory?.phone,
      customerAddress: selectedDealerHistory?.address,
      items: Array.isArray(sale.items)
        ? sale.items.map((i: any) => ({
            name: i.product_name || i.name || 'Item',
            qty: i.quantity || i.qty || 1,
            unitPrice: i.unit_price || i.price || 0,
            discount: i.item_discount || 0,
            total: i.line_total || (i.unit_price * i.quantity),
          }))
        : [],
      subtotal: sale.subtotal || sale.total,
      taxAmount: sale.tax_amount || 0,
      discountAmount: sale.discount || 0,
      totalAmount: sale.total || 0,
      paymentMethod: `PAID via ${(sale.payment_method || 'cash').toUpperCase()}`,
      notes: `Wholesale Dealer: ${selectedDealerHistory?.company_name}`,
    };

    printInvoice(cfg, invoiceData, 'Wholesale Dealer Invoice');
  };

  const activeCount = dealers.filter((d) => d.status === 'active').length;
  const pendingCount = dealers.filter((d) => d.status === 'pending').length;
  const avgDiscount =
    dealers.length > 0
      ? (dealers.reduce((acc, d) => acc + (d.discount_rate || 0), 0) / dealers.length).toFixed(1)
      : '0';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-7 w-7 text-indigo-500" /> Wholesale Dealers & B2B
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage wholesale clients, customized discount rates, credit limits, and view full B2B purchase history.
          </p>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20"
        >
          <Plus className="h-4 w-4" /> Add Wholesale Dealer
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border/80 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Total Dealers</p>
            <p className="text-xl font-black text-foreground">{dealers.length}</p>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Active Partners</p>
            <p className="text-xl font-black text-foreground">{activeCount}</p>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Pending Approval</p>
            <p className="text-xl font-black text-foreground">{pendingCount}</p>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
            <Percent className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Avg B2B Discount</p>
            <p className="text-xl font-black text-foreground">{avgDiscount}%</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border/80 p-3 rounded-2xl">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by company, contact, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-input rounded-xl pl-9 pr-4 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-muted-foreground font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-background border border-input rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="pending">Pending Only</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Dealers Table */}
      <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-xs text-muted-foreground">Loading wholesale dealers...</div>
        ) : filteredDealers.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-semibold text-foreground">No Wholesale Dealers Found</p>
            <p className="text-xs text-muted-foreground">
              Add your first B2B dealer to set up custom pricing and purchase tracking.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Company & Contact</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4 text-center">B2B Discount</th>
                  <th className="py-3 px-4 text-right">Credit Limit</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredDealers.map((dealer) => (
                  <tr key={dealer.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleViewHistory(dealer)}
                        className="text-left font-bold text-foreground hover:text-indigo-400 transition-colors block text-sm"
                      >
                        {dealer.company_name}
                      </button>
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
                        Attn: {dealer.contact_name} {dealer.tax_id ? `· Tax: ${dealer.tax_id}` : ''}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-indigo-400" /> {dealer.email}
                        </p>
                        {dealer.phone && (
                          <p className="text-muted-foreground flex items-center gap-1.5">
                            <Phone className="h-3 w-3 text-emerald-400" /> {dealer.phone}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {dealer.discount_rate || 0}% Off
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-foreground">
                      LKR {(dealer.credit_limit || 0).toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                          dealer.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : dealer.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {dealer.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          onClick={() => handleViewHistory(dealer)}
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg flex items-center gap-1"
                          title="View Dealer Purchase History"
                        >
                          <History className="h-3.5 w-3.5" /> History
                        </Button>
                        <Button
                          onClick={() => handleOpenModal(dealer)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          onClick={() => setDeleteTarget(dealer)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Add / Edit Dealer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-500" />
                {editingDealer ? 'Edit Wholesale Dealer' : 'Add Wholesale Dealer'}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 text-muted-foreground rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="e.g. Apex Tech Distributors"
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Contact Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="e.g. John Doe (Procurement Manager)"
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. b2b@apextech.lk"
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. +94 77 123 4567"
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">VAT / Tax ID</label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="e.g. VAT-12938475"
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="active">Active (Approved B2B Partner)</option>
                    <option value="pending">Pending Approval</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Wholesale Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formData.discount_rate}
                    onChange={(e) => setFormData({ ...formData, discount_rate: e.target.value })}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Credit Limit (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Business Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 100 Commercial Road, Colombo 03"
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Special payment terms, contract reference, etc."
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-4 rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  {isPending ? 'Saving...' : editingDealer ? 'Update Dealer' : 'Add Dealer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dealer Purchase History Slide-Over / Modal */}
      {selectedDealerHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-end p-0 sm:p-4">
          <div className="bg-card border-l sm:border border-border w-full max-w-2xl h-full sm:h-[90vh] sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-500" />
                  {selectedDealerHistory.company_name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  B2B Purchase & Transaction History · Contact: {selectedDealerHistory.contact_name} ({selectedDealerHistory.email})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedDealerHistory(null)}
                className="h-8 w-8 text-muted-foreground rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Dealer Stats Summary */}
            <div className="p-4 bg-muted/10 border-b border-border grid grid-cols-3 gap-3">
              <div>
                <span className="text-[11px] text-muted-foreground block font-medium">B2B Discount</span>
                <span className="text-sm font-black text-indigo-400">{selectedDealerHistory.discount_rate || 0}% Off</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block font-medium">Credit Limit</span>
                <span className="text-sm font-black text-foreground">LKR {(selectedDealerHistory.credit_limit || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block font-medium">Total Orders</span>
                <span className="text-sm font-black text-emerald-400">{purchaseHistory.length} Sales</span>
              </div>
            </div>

            {/* Purchase History List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {historyLoading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Fetching dealer purchases...</div>
              ) : purchaseHistory.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">No Purchase History Found</p>
                  <p className="text-xs text-muted-foreground">
                    This dealer has not completed any POS sales or online orders yet.
                  </p>
                </div>
              ) : (
                purchaseHistory.map((sale) => (
                  <div key={sale.id} className="bg-background border border-border/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-foreground text-sm">
                          Receipt #{sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {new Date(sale.date || sale.created).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-emerald-500 block">
                          LKR {(sale.total || 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {sale.payment_method || 'CASH'}
                        </span>
                      </div>
                    </div>

                    {Array.isArray(sale.items) && sale.items.length > 0 && (
                      <div className="bg-muted/30 rounded-lg p-2.5 text-xs space-y-1">
                        {sale.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-muted-foreground">
                            <span>
                              {item.product_name || item.name} x{item.quantity || item.qty || 1}
                            </span>
                            <span className="font-semibold text-foreground">
                              LKR {(item.line_total || item.unit_price * (item.quantity || 1)).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={() => handlePrintHistoryInvoice(sale)}
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                      >
                        <Printer className="h-3.5 w-3.5" /> Print Invoice
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 text-center space-y-4">
            <div className="h-12 w-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Delete Wholesale Dealer?</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Are you sure you want to remove <strong className="text-foreground">{deleteTarget.company_name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                className="h-9 px-4 rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={isPending}
                className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
              >
                {isPending ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
