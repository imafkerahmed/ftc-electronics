'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import {
  FileText,
  Plus,
  Search,
  Printer,
  Calendar,
  User,
  Trash2,
  Copy,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
  Building2,
  Phone,
  MapPin,
  Sparkles,
  Edit,
  ArrowRightCircle,
  ShoppingBag,
  Percent,
  Check,
  UserPlus,
  Mail,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getQuotationsAction,
  saveQuotationAction,
  deleteQuotationAction,
  convertQuotationToSaleAction,
  getWholesaleDealersAction,
  searchPosCustomersAction,
  sendQuotationEmailAction,
} from '@/app/actions/admin';
import { useQuery } from '@tanstack/react-query';
import { adminKeys } from '@/lib/query-keys';
import { DEFAULT_INVOICE_CONFIG, normalizeInvoiceConfig } from '@/types/invoice-config';
import { printInvoice, resolveInvoiceConfig, type InvoiceData, type InvoiceItem } from '@/lib/invoice-print';
import type { PBWholesaleDealer, PBQuotation } from '@/types/admin';
import type { PaymentMethod } from '@/types/pos';
import type { Product } from '@/types/product';
import { pbProducts, sanitizeImageUrl } from '@/lib/supabase-collections';
import { supabase } from '@/lib/supabase';

interface CustomerOption {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Quotation {
  id: string;
  quoteNumber: string;
  quoteType: 'wholesale' | 'direct';
  dealerId?: string;
  customerName: string;
  customerCompany?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  date: string;
  dueDate: string;
  validUntil?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  discountType?: 'flat' | 'percent';
  discountValue?: number;
  totalAmount: number;
  notes: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
}

function fmt(amount: number) {
  return amount.toLocaleString('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  });
}

export default function AdminQuotationsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'all' | 'wholesale' | 'direct'>('all');
  const [isPending, startTransition] = useTransition();

  // Fetch quotations via React Query
  const {
    data: quotationsData,
    isLoading: isQuotationsLoading,
    isFetching: isQuotationsFetching,
    refetch: refetchQuotations,
  } = useQuery({
    queryKey: adminKeys.quotations({
      page,
      pageSize,
      search: searchQuery,
      status: filterStatus === 'All' ? undefined : filterStatus.toLowerCase(),
      quoteType: typeFilter === 'all' ? undefined : typeFilter,
    }),
    queryFn: async () => {
      const res = await getQuotationsAction({
        page,
        pageSize,
        search: searchQuery,
        status: filterStatus === 'All' ? undefined : filterStatus.toLowerCase(),
        quoteType: typeFilter === 'all' ? undefined : typeFilter,
      });
      if (!res.success) throw new Error(res.error || 'Failed to fetch quotations');

      const formatted: Quotation[] = (res.data as any[]).map((q) => ({
        id: q.id,
        quoteNumber: q.quote_number,
        quoteType: (q.quote_type as 'wholesale' | 'direct') || (q.customer_company ? 'wholesale' : 'direct'),
        dealerId: q.dealer_id,
        customerName: q.customer_name,
        customerCompany: q.customer_company,
        customerEmail: q.customer_email,
        customerPhone: q.customer_phone,
        customerAddress: q.customer_address,
        date: new Date(q.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        dueDate: q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
        validUntil: q.valid_until || '',
        items: Array.isArray(q.items) ? q.items : [],
        subtotal: q.subtotal || 0,
        taxAmount: q.tax_amount || 0,
        discountAmount: q.discount_amount || 0,
        discountType: (q.discount_type as 'flat' | 'percent') || 'flat',
        discountValue: q.discount_value !== undefined ? q.discount_value : (q.discount_amount || 0),
        totalAmount: q.total_amount || 0,
        notes: q.notes || '',
        status: q.status || 'draft',
      }));

      return {
        items: formatted,
        total: res.total || 0,
        totalPages: res.totalPages || 1,
      };
    },
  });

  const quotations = quotationsData?.items || [];
  const totalItems = quotationsData?.total || 0;
  const totalPages = quotationsData?.totalPages || 1;
  const [loading, setLoading] = useState(true);

  // Database lookup lists
  const [wholesaleDealers, setWholesaleDealers] = useState<PBWholesaleDealer[]>([]);
  const [existingCustomers, setExistingCustomers] = useState<CustomerOption[]>([]);

  // Toast alert
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);

  // Form State
  const [quoteType, setQuoteType] = useState<'wholesale' | 'direct'>('wholesale');
  const [selectedDealerId, setSelectedDealerId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [createIfNew, setCreateIfNew] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2>(1);

  const [custName, setCustName] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [validDays, setValidDays] = useState(14);
  const [notes, setNotes] = useState('Quotation valid for 14 days from issue date. Prices subject to stock availability.');
  const [lineItems, setLineItems] = useState<InvoiceItem[]>([
    { name: '', qty: 1, unitPrice: 0 },
  ]);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'flat' | 'percent'>('flat');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [focusedLineItemIndex, setFocusedLineItemIndex] = useState<number | null>(null);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number>(-1);
  const blurTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Convert to Sale Modal State
  const [convertingQuote, setConvertingQuote] = useState<Quotation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [convertedSale, setConvertedSale] = useState<{ saleId: string; receiptNumber?: string } | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  // Cleanup blur timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  // Load Dealers, and Customers
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [dRes, cRes, pRes] = await Promise.all([
        getWholesaleDealersAction().catch(() => ({ success: false, data: [] })),
        searchPosCustomersAction('').catch(() => ({ success: false, data: [] })),
        fetch('/api/pos/products')
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data && Array.isArray(data.products) ? data : { products: [] };
          })
          .catch((err) => {
            console.warn('[loadInitialData] Could not load POS product suggestions:', err);
            return { products: [] };
          }),
      ]);

      if (pRes && pRes.products) {
        setAllProducts(pRes.products.map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.sku,
          price: p.price,
          discountPrice: p.price,
          wholesalePrice: p.wholesalePrice,
          images: p.imageUrl ? [p.imageUrl] : [],
          description: '',
          category: p.category || '',
          brand: '',
          specs: {},
          rating: 0,
          numReviews: 0,
          countInStock: p.countInStock || 0,
          createdAt: ''
        })) as Product[]);
      }

      if (dRes.success && dRes.data) {
        setWholesaleDealers(dRes.data);
      }

      if (cRes.success && cRes.data) {
        setExistingCustomers(
          cRes.data.map((c: { id: string; name?: string; customer_name?: string; email?: string; phone?: string }) => ({
            id: c.id,
            name: c.name || c.customer_name || 'Unnamed Customer',
            email: c.email || '',
            phone: c.phone || '',
          }))
        );
      }
    } catch (err) {
      console.error('[loadInitialData] Failed to load initial quotation data:', err);
      showToast('Failed to load quotation data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialData();
  }, []);

  // Keyboard shortcut: Dismiss active modal on Escape keypress
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (convertingQuote) {
          setConvertingQuote(null);
          setConvertedSale(null);
        } else if (isModalOpen) {
          setIsModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, convertingQuote]);

  // Handle selecting an existing Wholesale Dealer
  const handleSelectDealer = (dealerId: string) => {
    setSelectedDealerId(dealerId);
    if (!dealerId) return;
    const dealer = wholesaleDealers.find((d) => d.id === dealerId);
    if (dealer) {
      setCustName(dealer.contact_name || dealer.company_name);
      setCustCompany(dealer.company_name);
      setCustEmail(dealer.email || '');
      setCustPhone(dealer.phone || '');
      setCustAddress(dealer.address || '');
    }
  };

  // Handle selecting an existing Direct Customer
  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (!customerId) return;
    const customer = existingCustomers.find((c) => c.id === customerId);
    if (customer) {
      setCustName(customer.name);
      setCustCompany('');
      setCustEmail(customer.email || '');
      setCustPhone(customer.phone || '');
      setCustAddress('');
    }
  };

  const handleOpenModal = (quote?: Quotation) => {
    setEditingQuote(quote || null);
    setFormStep(1);
    if (quote) {
      setEditingQuote(quote);
      setQuoteType(quote.quoteType || 'wholesale');
      setSelectedDealerId(quote.dealerId || '');
      setSelectedCustomerId('');
      setCustName(quote.customerName || '');
      setCustCompany(quote.customerCompany || '');
      setCustEmail(quote.customerEmail || '');
      setCustPhone(quote.customerPhone || '');
      setCustAddress(quote.customerAddress || '');
      setNotes(quote.notes || '');
      const remaining = quote.validUntil
        ? Math.max(1, Math.round((new Date(quote.validUntil).getTime() - Date.now()) / 86400000))
        : 14;
      setValidDays(remaining);
      setLineItems(quote.items && quote.items.length > 0 ? quote.items : [{ name: '', qty: 1, unitPrice: 0 }]);
      setGlobalDiscount(quote.discountValue !== undefined ? quote.discountValue : (quote.discountAmount || 0));
      setGlobalDiscountType(quote.discountType || 'flat');
    } else {
      setEditingQuote(null);
      setQuoteType('wholesale');
      setSelectedDealerId('');
      setSelectedCustomerId('');
      setCreateIfNew(false);
      setCustName('');
      setCustCompany('');
      setCustEmail('');
      setCustPhone('');
      setCustAddress('');
      setValidDays(14);
      setNotes('Quotation valid for 14 days from issue date. Prices subject to stock availability.');
      setLineItems([{ name: '', qty: 1, unitPrice: 0 }]);
      setGlobalDiscount(0);
      setGlobalDiscountType('flat');
    }
    setFormStep(1);
    setIsModalOpen(true);
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [...prev, { name: '', qty: 1, unitPrice: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateLineItem = <K extends keyof InvoiceItem>(index: number, field: K, val: InvoiceItem[K]) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const calculateSubtotal = () =>
    Math.round(
      lineItems.reduce((acc, item) => acc + Math.max(0, item.qty || 1) * Math.max(0, item.unitPrice || 0), 0)
    );

  const calculateTotalDiscount = () => {
    const sub = calculateSubtotal();
    if (sub <= 0) return 0;
    const val = Number(globalDiscount);
    if (isNaN(val) || !isFinite(val) || val <= 0) return 0;

    let raw = 0;
    if (globalDiscountType === 'percent') {
      const clampedPercent = Math.min(Math.max(val, 0), 100);
      raw = (sub * clampedPercent) / 100;
    } else {
      raw = Math.min(Math.max(val, 0), sub);
    }
    const rounded = Math.round(raw);
    return Math.min(Math.max(rounded, 0), sub);
  };

  const calculateTotal = () => {
    const sub = calculateSubtotal();
    const disc = calculateTotalDiscount();
    return Math.max(0, sub - disc);
  };

  const handleSaveQuotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      alert('Please fill out customer name.');
      return;
    }

    const validLines = lineItems.filter((i) => i.name.trim().length > 0);
    if (validLines.length === 0) {
      alert('Please add at least one line item.');
      return;
    }

    for (const item of validLines) {
      const qtyNum = Number(item.qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0 || !Number.isFinite(qtyNum)) {
        alert(`Invalid quantity for item "${item.name}". Quantity must be a positive whole number.`);
        return;
      }
      if (item.unitPrice < 0) {
        alert(`Invalid price for item "${item.name}".`);
        return;
      }
    }

    startTransition(async () => {
      const quoteNo = editingQuote
        ? editingQuote.quoteNumber
        : `QUO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const expiryDateISO = new Date(Date.now() + validDays * 86400000).toISOString();

      const sub = calculateSubtotal();
      const disc = calculateTotalDiscount();
      const tot = calculateTotal();
      const rawVal = Number(globalDiscount);
      const safeVal = isNaN(rawVal) || !isFinite(rawVal) ? 0 : Math.max(0, rawVal);
      const clampedDiscountVal = globalDiscountType === 'percent'
        ? Math.min(safeVal, 100)
        : Math.min(safeVal, sub);

      const payload = {
        quote_number: quoteNo,
        quote_type: quoteType,
        dealer_id: selectedDealerId || undefined,
        customer_name: custName.trim(),
        customer_company: custCompany.trim(),
        customer_email: custEmail.trim(),
        customer_phone: custPhone.trim(),
        customer_address: custAddress.trim(),
        items: validLines.map((i) => {
          const validQty = Math.floor(Number(i.qty));
          const validPrice = Number(i.unitPrice) || 0;
          return {
            ...i,
            name: i.name.trim(),
            qty: validQty,
            unitPrice: validPrice,
            total: validQty * validPrice,
          };
        }),
        subtotal: sub,
        tax_amount: 0,
        discount_amount: disc,
        discount_type: globalDiscountType,
        discount_value: clampedDiscountVal,
        total_amount: tot,
        valid_until: expiryDateISO,
        status: editingQuote ? editingQuote.status : ('draft' as const),
        notes: notes.trim(),
        createDealerIfNew: createIfNew && quoteType === 'wholesale',
        createCustomerIfNew: createIfNew && quoteType === 'direct',
      };

      const res = await saveQuotationAction(payload, editingQuote?.id);
      if (res.success) {
        showToast(editingQuote ? 'Quotation updated successfully!' : 'Quotation created successfully!');
        setIsModalOpen(false);
        void loadInitialData();
      } else {
        showToast(res.error || 'Failed to save quotation.', 'error');
      }
    });
  };

  const handleDeleteQuotation = (id: string) => {
    if (!confirm('Are you sure you want to delete this quotation?')) return;
    startTransition(async () => {
      const res = await deleteQuotationAction(id);
      if (res.success) {
        showToast('Quotation deleted.');
        void loadInitialData();
      } else {
        showToast(res.error || 'Failed to delete quotation.', 'error');
      }
    });
  };

  const handleConvertQuotation = () => {
    if (!convertingQuote) return;
    startTransition(async () => {
      const res = await convertQuotationToSaleAction(convertingQuote.id, paymentMethod);
      if (res.success && res.saleId) {
        showToast('Quotation converted to Official Paid Sale!');
        setConvertedSale({ saleId: res.saleId, receiptNumber: res.receiptNumber });
        void loadInitialData();
      } else {
        showToast(res.error || 'Failed to convert quotation.', 'error');
      }
    });
  };

  const handlePrintQuotation = async (quote: Quotation) => {
    const cfg = await resolveInvoiceConfig();

    const invoiceData: InvoiceData = {
      docType: 'Quotation',
      docNumber: quote.quoteNumber,
      date: quote.date,
      dueDate: quote.dueDate,
      customerName: quote.customerName,
      customerCompany: quote.customerCompany,
      customerPhone: quote.customerPhone,
      customerAddress: quote.customerAddress,
      items: quote.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
      })),
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      discountAmount: quote.discountAmount,
      totalAmount: quote.totalAmount,
      paymentMethod: 'UNPAID / QUOTATION ESTIMATE',
      notes: quote.notes,
    };

    printInvoice(cfg, invoiceData, `Quotation — ${quote.quoteNumber}`);
  };

  const handlePrintConvertedPaidInvoice = async (quote: Quotation, receiptNo?: string) => {
    const cfg = await resolveInvoiceConfig();

    const invoiceData: InvoiceData = {
      docType: 'Invoice',
      docNumber: receiptNo || quote.quoteNumber,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      customerName: quote.customerName,
      customerCompany: quote.customerCompany,
      customerPhone: quote.customerPhone,
      customerAddress: quote.customerAddress,
      items: quote.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
      })),
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      discountAmount: quote.discountAmount,
      totalAmount: quote.totalAmount,
      paymentMethod: `PAID via ${paymentMethod.toUpperCase()}`,
      notes: `Official Paid Invoice. Converted from Quotation #${quote.quoteNumber}`,
    };

    printInvoice(cfg, invoiceData, `Paid Invoice — ${quote.quoteNumber}`);
  };

  const handleSendEmail = (quote: Quotation) => {
    if (!quote.customerEmail) {
      showToast('No customer email configured for this quotation.', 'error');
      return;
    }
    setSendingEmailId(quote.id);
    startTransition(async () => {
      const res = await sendQuotationEmailAction(quote.id);
      if (res.success) {
        showToast(`Quotation emailed to ${quote.customerEmail} successfully!`);
        void loadInitialData();
      } else {
        showToast(res.error || 'Failed to send email.', 'error');
      }
      setSendingEmailId(null);
    });
  };

  const totalValue = quotations.reduce((acc, q) => acc + q.totalAmount, 0);
  const wholesaleCount = quotations.filter((q) => q.quoteType === 'wholesale').length;
  const directCount = quotations.filter((q) => q.quoteType === 'direct').length;

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
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <FileText className="h-6 w-6 text-amber-500" /> Quotations & B2B Estimates
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Create Wholesale B2B or Direct Customer quotations, link existing dealers/customers, and convert accepted quotes to Paid Sales.
          </p>
        </div>

        <Button
          onClick={() => handleOpenModal()}
          className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5 shadow-lg shadow-amber-500/10 text-xs"
        >
          <Plus className="h-4 w-4" /> Create Quotation
        </Button>
      </div>

      {/* Analytics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center text-amber-500">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Quotations</p>
            <p className="text-xl font-black text-foreground">{quotations.length}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-500">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Wholesale B2B Quotes</p>
            <p className="text-xl font-black text-foreground">{wholesaleCount}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center text-blue-500">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Direct Customer Quotes</p>
            <p className="text-xl font-black text-foreground">{directCount}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center text-purple-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Quoted Value</p>
            <p className="text-xl font-black text-foreground">{fmt(totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card border border-border p-3 rounded-xl">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes by number, customer, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs bg-background"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'wholesale' | 'direct')}
            className="bg-background border border-input rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="all">All Types</option>
            <option value="wholesale">Wholesale B2B Only</option>
            <option value="direct">Direct Customer Only</option>
          </select>

          {/* Status Filter */}
          {(['All', 'Active', 'Accepted', 'Rejected', 'Expired'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                filterStatus === status
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                  : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Quotations List Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {isQuotationsLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground">Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
            <FileText className="h-8 w-8 opacity-40 text-amber-500" />
            <p className="text-sm font-semibold">No quotations found.</p>
            <p className="text-xs text-muted-foreground">Click &ldquo;Create Quotation&rdquo; to generate an estimate.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-muted-foreground font-bold text-[10px] uppercase tracking-wider">
                  <th className="p-4">Quote No & Type</th>
                  <th className="p-4">Customer / Company</th>
                  <th className="p-4">Valid Until</th>
                  <th className="p-4 text-right">Items</th>
                  <th className="p-4 text-right">Total Amount</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {quotations.map((quote) => (
                  <tr key={quote.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-4 space-y-1">
                      <span className="font-mono font-bold text-amber-500 block text-sm">{quote.quoteNumber}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          quote.quoteType === 'wholesale'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {quote.quoteType === 'wholesale' ? (
                          <>
                            <Building2 className="h-3 w-3" /> Wholesale B2B
                          </>
                        ) : (
                          <>
                            <User className="h-3 w-3" /> Direct Customer
                          </>
                        )}
                      </span>
                    </td>

                    <td className="p-4">
                      <p className="font-bold text-foreground">{quote.customerName}</p>
                      {quote.customerCompany && (
                        <p className="text-[10px] text-muted-foreground font-medium">{quote.customerCompany}</p>
                      )}
                      {quote.customerPhone && (
                        <p className="text-[10px] font-mono text-muted-foreground">{quote.customerPhone}</p>
                      )}
                    </td>

                    <td className="p-4 font-mono text-foreground font-semibold">{quote.dueDate}</td>

                    <td className="p-4 text-right font-bold text-foreground">
                      {quote.items.reduce((a, b) => a + b.qty, 0)} items
                    </td>

                    <td className="p-4 text-right font-black text-foreground text-sm">
                      {fmt(quote.totalAmount)}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold capitalize border ${
                          quote.status === 'accepted'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : quote.status === 'sent' || quote.status === 'draft'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}
                      >
                        {quote.status === 'accepted' ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Paid Sale
                          </>
                        ) : quote.status === 'sent' || quote.status === 'draft' ? (
                          <>
                            <Clock className="h-3 w-3" /> Active
                          </>
                        ) : quote.status === 'rejected' ? (
                          <>
                            <XCircle className="h-3 w-3" /> Rejected
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" /> Expired
                          </>
                        )}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {quote.status !== 'accepted' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setConvertingQuote(quote);
                              setConvertedSale(null);
                            }}
                            className="h-8 text-[11px] font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
                            title="Turn quotation into Paid Sale"
                          >
                            <ArrowRightCircle className="h-3.5 w-3.5" /> Convert to Sale
                          </Button>
                        )}

                        {quote.status !== 'accepted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendEmail(quote)}
                            disabled={sendingEmailId === quote.id || isPending || !quote.customerEmail}
                            className="h-8 text-[11px] font-bold gap-1 text-blue-500 border-blue-500/30 hover:bg-blue-500/10 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                            title={quote.customerEmail ? "Send quotation via email to customer" : "Customer email not configured"}
                          >
                            {sendingEmailId === quote.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Mail className="h-3 w-3" />
                            )}
                            {quote.status === 'sent' ? 'Resend' : 'Email'}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintQuotation(quote)}
                          className="h-8 text-[11px] font-bold gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 rounded-lg"
                          title="Print Quotation"
                        >
                          <Printer className="h-3 w-3" /> Print
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenModal(quote)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
                          title="Edit Quote"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteQuotation(quote.id)}
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                          title="Delete Quote"
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

        {/* Pagination Controls */}
        {!isQuotationsLoading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <div className="text-xs text-muted-foreground font-medium">
              Showing <span className="text-foreground font-bold">{quotations.length}</span> of <span className="text-foreground font-bold">{totalItems}</span> quotations
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isQuotationsFetching}
                className="h-8 text-[11px] font-bold"
              >
                Previous
              </Button>
              <div className="text-xs font-bold px-2">
                Page {page} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || isQuotationsFetching}
                className="h-8 text-[11px] font-bold"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Quotation Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create / Edit Quotation"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-black text-foreground">
                  {editingQuote ? `Edit Quotation #${editingQuote.quoteNumber}` : 'Create Order Quotation'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveQuotation} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">

              {/* --- STEP 1: Customer Details --- */}
              {formStep === 1 && (
                <>
                  {/* Quotation Type Selector */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-foreground block uppercase tracking-wider text-muted-foreground">
                  Quotation Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setQuoteType('wholesale');
                      setSelectedCustomerId('');
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-3 transition-colors text-left ${
                      quoteType === 'wholesale'
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 font-bold'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Building2 className="h-5 w-5 shrink-0 text-indigo-400" />
                    <div>
                      <span className="block text-xs">Wholesale Dealer</span>
                      <span className="text-[10px] text-muted-foreground font-normal">B2B client with discount rate</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setQuoteType('direct');
                      setSelectedDealerId('');
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-3 transition-colors text-left ${
                      quoteType === 'direct'
                        ? 'bg-blue-500/10 border-blue-500 text-blue-400 font-bold'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <User className="h-5 w-5 shrink-0 text-blue-400" />
                    <div>
                      <span className="block text-xs">Direct Customer</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Standard retail or walk-in buyer</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Existing Record Lookup / Autocomplete */}
              <div className="bg-muted/20 border border-border/80 p-3.5 rounded-xl space-y-3">
                {quoteType === 'wholesale' ? (
                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Select Existing Wholesale Dealer
                    </label>
                    <select
                      value={selectedDealerId}
                      onChange={(e) => handleSelectDealer(e.target.value)}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">-- Choose from {wholesaleDealers.length} Registered Dealers or enter new below --</option>
                      {wholesaleDealers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.company_name} ({d.contact_name}) — {d.discount_rate || 0}% Off
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Select Existing Customer
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => handleSelectCustomer(e.target.value)}
                      className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">-- Choose from Existing Customers or enter new below --</option>
                      {existingCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''} {c.email ? `· ${c.email}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Customer Info Form */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                    {quoteType === 'wholesale' ? 'Dealer & Client Details' : 'Customer Contact Details'}
                  </h4>

                  {!selectedDealerId && !selectedCustomerId && (
                    <label className="flex items-center gap-1.5 text-xs text-indigo-400 cursor-pointer font-bold">
                      <input
                        type="checkbox"
                        checked={createIfNew}
                        onChange={(e) => setCreateIfNew(e.target.checked)}
                        className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                      />
                      <UserPlus className="h-3.5 w-3.5" /> Save as new {quoteType === 'wholesale' ? 'Wholesale Dealer' : 'Customer'}
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      {quoteType === 'wholesale' ? 'Contact Person Name *' : 'Customer Full Name *'}
                    </label>
                    <Input
                      placeholder="e.g. John Doe"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      required
                      className="text-xs bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Company Name {quoteType === 'wholesale' ? '*' : '(Optional)'}
                    </label>
                    <Input
                      placeholder="e.g. Apex Technology Solutions Ltd"
                      value={custCompany}
                      onChange={(e) => setCustCompany(e.target.value)}
                      required={quoteType === 'wholesale'}
                      className="text-xs bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">Email Address</label>
                    <Input
                      type="email"
                      placeholder="procurement@client.lk"
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      className="text-xs bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-foreground block mb-1">Phone Number</label>
                    <Input
                      placeholder="+94 77 123 4567"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      className="text-xs bg-background"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-foreground block mb-1">Billing / Delivery Address</label>
                  <Input
                    placeholder="No. 45 Galle Road, Colombo 03, Sri Lanka"
                    value={custAddress}
                    onChange={(e) => setCustAddress(e.target.value)}
                    className="text-xs bg-background"
                  />
                </div>
              </div>

              {/* Validity Period */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                    Validity Period
                  </h4>
                  <span className="text-[11px] font-bold text-amber-500">
                    Valid for {validDays} Days (Expires{' '}
                    {/* eslint-disable-next-line react-hooks/purity */}
                    {new Date(Date.now() + validDays * 86400000).toLocaleDateString()})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {[7, 14, 30, 60].map((days) => (
                    <button
                      type="button"
                      key={days}
                      onClick={() => setValidDays(days)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        validDays === days
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                          : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions Step 1 */}
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
                  type="button"
                  onClick={() => setFormStep(2)}
                  disabled={!custName.trim() || (quoteType === 'wholesale' && !custCompany.trim())}
                  className="h-9 px-5 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold text-xs flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next: Line Items <ArrowRightCircle className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* --- STEP 2: Line Items & Totals --- */}
          {formStep === 2 && (
            <>
              {/* Line Items Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                    Quotation Line Items
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddLineItem}
                    className="h-7 text-[11px] font-bold gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                  >
                    <Plus className="h-3 w-3" /> Add Item Line
                  </Button>
                </div>

                <div className="space-y-2">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 pb-2 border-b border-border/50 text-[10px] font-black uppercase text-muted-foreground tracking-wider items-center">
                    <div className="col-span-6 pl-2">Product Details</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Unit Price</div>
                    <div className="col-span-2 text-right pr-12">Line Total</div>
                  </div>

                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-4 items-center group relative p-2 rounded-xl hover:bg-accent/30 transition-colors border border-transparent hover:border-border/50">

                      <div className="col-span-6 relative">
                        {(() => {
                          const term = item.name.toLowerCase().trim();
                          const suggestions =
                            focusedLineItemIndex === idx && term.length >= 1
                              ? allProducts
                                  .filter(
                                    (p) =>
                                      p.name.toLowerCase().includes(term) ||
                                      (p.slug && p.slug.toLowerCase().includes(term))
                                  )
                                  .slice(0, 8)
                              : [];

                          const selectProduct = (prod: Product) => {
                            const retailPrice = prod.discountPrice || prod.price;
                            const resolvedPrice =
                              quoteType === 'wholesale' && prod.wholesalePrice
                                ? prod.wholesalePrice
                                : retailPrice;

                            handleUpdateLineItem(idx, 'name', prod.name);
                            handleUpdateLineItem(idx, 'unitPrice', resolvedPrice);
                            setFocusedLineItemIndex(null);
                            setActiveSuggestionIdx(-1);
                          };

                          return (
                            <>
                              <Input
                                placeholder="Product name or description"
                                value={item.name}
                                role="combobox"
                                aria-expanded={suggestions.length > 0}
                                aria-controls={`quote-line-item-suggestions-${idx}`}
                                aria-autocomplete="list"
                                aria-activedescendant={
                                  activeSuggestionIdx >= 0
                                    ? `quote-line-item-option-${idx}-${activeSuggestionIdx}`
                                    : undefined
                                }
                                onChange={(e) => {
                                  handleUpdateLineItem(idx, 'name', e.target.value);
                                  setActiveSuggestionIdx(-1);
                                }}
                                onFocus={() => {
                                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                                  setFocusedLineItemIndex(idx);
                                  setActiveSuggestionIdx(-1);
                                }}
                                onBlur={() => {
                                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                                  blurTimerRef.current = setTimeout(() => {
                                    setFocusedLineItemIndex(null);
                                    setActiveSuggestionIdx(-1);
                                  }, 250);
                                }}
                                onKeyDown={(e) => {
                                  if (!suggestions.length) return;
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setActiveSuggestionIdx((prev) =>
                                      prev < suggestions.length - 1 ? prev + 1 : 0
                                    );
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setActiveSuggestionIdx((prev) =>
                                      prev > 0 ? prev - 1 : suggestions.length - 1
                                    );
                                  } else if (
                                    e.key === 'Enter' &&
                                    activeSuggestionIdx >= 0 &&
                                    activeSuggestionIdx < suggestions.length
                                  ) {
                                    e.preventDefault();
                                    selectProduct(suggestions[activeSuggestionIdx]);
                                  } else if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setFocusedLineItemIndex(null);
                                    setActiveSuggestionIdx(-1);
                                  }
                                }}
                                className="text-xs bg-background"
                                required
                              />
                              {suggestions.length > 0 && (
                                <div
                                  role="listbox"
                                  id={`quote-line-item-suggestions-${idx}`}
                                  className="absolute left-0 top-full mt-1 w-[160%] min-w-[320px] max-w-[500px] bg-popover border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto z-50 p-1 divide-y divide-border/40"
                                >
                                  {suggestions.map((prod, sIdx) => {
                                    const isSelected = activeSuggestionIdx === sIdx;
                                    return (
                                      <button
                                        type="button"
                                        key={prod.id}
                                        id={`quote-line-item-option-${idx}-${sIdx}`}
                                        role="option"
                                        aria-selected={isSelected}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          selectProduct(prod);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-[11px] transition-colors flex justify-between items-center rounded-lg cursor-pointer ${
                                          isSelected ? 'bg-amber-500/15 font-bold' : 'hover:bg-muted/70'
                                        }`}
                                      >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                          {prod.images && prod.images[0] ? (
                                            <img
                                              src={sanitizeImageUrl(prod.images[0])}
                                              alt={prod.name}
                                              className="w-8 h-8 object-cover rounded-md bg-white shrink-0"
                                            />
                                          ) : (
                                            <div className="w-8 h-8 bg-muted rounded-md flex items-center justify-center shrink-0">
                                              <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                          )}
                                          <span className="font-semibold text-foreground truncate">{prod.name}</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                                          {quoteType === 'wholesale' && prod.wholesalePrice ? (
                                            <span className="text-amber-500 font-bold">WS: {fmt(prod.wholesalePrice)}</span>
                                          ) : (
                                            <span>RT: {fmt(prod.discountPrice || prod.price)}</span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) => handleUpdateLineItem(idx, 'qty', parseInt(e.target.value) || 1)}
                          className="text-xs bg-background text-center font-bold px-1"
                          required
                        />
                      </div>

                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder="Price"
                          value={item.unitPrice || ''}
                          className="text-xs bg-background text-right font-medium"
                          onChange={(e) => handleUpdateLineItem(idx, 'unitPrice', e.target.value ? Number(e.target.value) : 0)}
                          required
                        />
                      </div>

                      <div className="col-span-2 text-right font-bold pr-12 text-sm flex items-center justify-end">
                        LKR {((item.qty || 1) * (item.unitPrice || 0)).toLocaleString()}
                      </div>

                      <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(idx)}
                          disabled={lineItems.length <= 1}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quotation Summary */}
                <div className="p-4 bg-muted/40 rounded-xl border border-border/50 space-y-3">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>LKR {calculateSubtotal().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-2">
                      Global Discount
                      <div className="flex items-center gap-1 bg-background border border-border rounded-md p-0.5 ml-4">
                        <button
                          type="button"
                          onClick={() => setGlobalDiscountType('flat')}
                          className={`px-2 py-0.5 text-[10px] rounded uppercase font-bold transition-colors ${globalDiscountType === 'flat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          LKR
                        </button>
                        <button
                          type="button"
                          onClick={() => setGlobalDiscountType('percent')}
                          className={`px-2 py-0.5 text-[10px] rounded uppercase font-bold transition-colors ${globalDiscountType === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          %
                        </button>
                      </div>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{globalDiscountType === 'percent' ? '-' : '- LKR'}</span>
                      <Input
                        type="number"
                        min="0"
                        className="w-24 h-7 text-right text-xs"
                        value={globalDiscount || ''}
                        onChange={(e) => setGlobalDiscount(e.target.value ? Number(e.target.value) : 0)}
                      />
                      {globalDiscountType === 'percent' && <span className="text-muted-foreground text-xs">%</span>}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border flex justify-between items-center">
                    <span className="text-lg font-black tracking-tight">Total Quoted Amount</span>
                    <span className="text-xl font-black text-primary">
                      LKR {calculateTotal().toLocaleString()}
                    </span>
                  </div>
                </div>

              {/* Terms & Notes */}
              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">Terms & Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-background border border-input rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                />
              </div>

              {/* Actions Step 2 */}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormStep(1)}
                  className="h-9 px-4 rounded-xl text-xs font-bold"
                >
                  Back to Details
                </Button>
                <div className="flex gap-2">
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
                    className="h-9 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs"
                  >
                    {isPending ? 'Saving...' : editingQuote ? 'Update Quotation' : 'Save & Issue Quotation'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </form>
          </div>
        </div>
      )}

      {/* Convert Quotation to Sale Modal */}
      {convertingQuote && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            setConvertingQuote(null);
            setConvertedSale(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Turn Quotation into Paid Sale"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <ShoppingBag className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-foreground">Turn Quotation into Paid Sale</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Convert <strong className="text-amber-400">#{convertingQuote.quoteNumber}</strong> ({fmt(convertingQuote.totalAmount)}) for <strong className="text-foreground">{convertingQuote.customerName}</strong> into an official Paid Invoice.
              </p>
            </div>

            {!convertedSale ? (
              <>
                <div className="text-left space-y-2">
                  <label className="text-xs font-bold text-foreground block">Select Payment Method:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cash', 'card', 'qr'] as const).map((method) => (
                      <button
                        type="button"
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`p-2.5 rounded-xl border text-xs font-bold uppercase transition-colors ${
                          paymentMethod === method
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                            : 'bg-background border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setConvertingQuote(null)}
                    className="h-9 px-4 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConvertQuotation}
                    disabled={isPending}
                    className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                  >
                    {isPending ? 'Processing...' : 'Confirm Paid Sale'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 font-bold">
                  ✓ Sale Complete! Receipt #{convertedSale.receiptNumber || convertedSale.saleId}
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => handlePrintConvertedPaidInvoice(convertingQuote, convertedSale.receiptNumber)}
                    className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Print Paid Invoice
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setConvertingQuote(null);
                      setConvertedSale(null);
                    }}
                    className="h-9 px-4 rounded-xl text-xs font-bold"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
