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
  Banknote,
  CreditCard,
  Receipt,
  History,
  Ban,
  ExternalLink,
  MoreHorizontal,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  getQuotationsAction,
  saveQuotationAction,
  deleteQuotationAction,
  convertQuotationToSaleAction,
  sendQuotationEmailAction,
  getQuotationByIdAction,
  searchQuotationProductsAction,
  searchQuotationCustomersAction,
  searchQuotationDealersAction,
  getWholesaleDealerByIdAction,
  voidQuotationAction,
  getQuotationHistoryAction,
  issueQuotationAction,
  acceptQuotationAction,
  rejectQuotationAction,
} from '@/app/actions/admin';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { adminKeys } from '@/lib/query-keys';
import { DEFAULT_INVOICE_CONFIG, normalizeInvoiceConfig } from '@/types/invoice-config';
import { printInvoice, resolveInvoiceConfig, type InvoiceData, type InvoiceItem } from '@/lib/invoice-print';
import type { PBWholesaleDealer, PBQuotation, QuotationVoidReason, QuotationDisplayStatus } from '@/types/admin';
import type { PaymentMethod, PaymentTerms } from '@/types/pos';
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
  itemsCount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  discountType?: 'flat' | 'percent';
  discountValue?: number;
  totalAmount: number;
  notes: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'voided';
  displayStatus: QuotationDisplayStatus;
  isConverted: boolean;
  linkedSaleId?: string | null;
  linkedInvoiceNumber?: string | null;
  linkedPaymentStatus?: string | null;
  linkedInvoiceRevokedAt?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  voidNotes?: string | null;
}

const VOID_REASON_OPTIONS: { value: QuotationVoidReason; label: string }[] = [
  { value: 'CUSTOMER_CANCELLED', label: 'Customer Cancelled' },
  { value: 'PRICING_ERROR', label: 'Pricing Error' },
  { value: 'DUPLICATE_QUOTATION', label: 'Duplicate Quotation' },
  { value: 'INCORRECT_CUSTOMER', label: 'Incorrect Customer' },
  { value: 'TERMS_CHANGED', label: 'Terms Changed' },
  { value: 'REPLACED_BY_NEW_QUOTATION', label: 'Replaced by New Quotation' },
  { value: 'ADMINISTRATIVE_ERROR', label: 'Administrative Error' },
  { value: 'OTHER', label: 'Other Reason (Notes Required)' },
];

function fmt(amount: number) {
  return amount.toLocaleString('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  });
}

export interface QuotationsWorkspaceProps {
  isActive?: boolean;
  initialSearch?: string;
  onNavigateTab?: (view: 'sales' | 'quotations' | 'receivables' | 'cheques', params?: { search?: string; id?: string }) => void;
}

export default function QuotationsWorkspace({
  isActive = true,
  initialSearch,
  onNavigateTab,
}: QuotationsWorkspaceProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || '');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'all' | 'wholesale' | 'direct'>('all');
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest'>('newest');
  const [isPending, startTransition] = useTransition();

  // Sync external search
  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  // Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [pageSize, debouncedSearch, filterStatus, typeFilter, sortFilter]);

  // Fetch quotations via React Query (lazy loaded when tab is active)
  const {
    data: quotationsData,
    isLoading: isQuotationsLoading,
    isFetching: isQuotationsFetching,
    refetch: refetchQuotations,
  } = useQuery({
    queryKey: adminKeys.quotations({
      page,
      pageSize,
      search: debouncedSearch,
      status: filterStatus === 'All' ? undefined : filterStatus.toLowerCase(),
      quoteType: typeFilter === 'all' ? undefined : typeFilter,
      sort: sortFilter,
    }),
    enabled: isActive,
    queryFn: async () => {
      const res = await getQuotationsAction({
        page,
        pageSize,
        search: debouncedSearch,
        status: filterStatus === 'All' ? undefined : filterStatus.toLowerCase(),
        quoteType: typeFilter === 'all' ? undefined : typeFilter,
        sort: sortFilter,
      });
      if (!res.success) throw new Error(res.error || 'Failed to fetch quotations');

      const formatted: Quotation[] = (res.data as any[]).map((q) => {
        const isConverted = Boolean(q.is_converted || q.linked_sale_id);
        let displayStatus: QuotationDisplayStatus = q.display_status;
        if (!displayStatus) {
          if (isConverted) {
            displayStatus = 'CONVERTED';
          } else if (q.status === 'voided') {
            displayStatus = 'VOIDED';
          } else if (q.status === 'rejected') {
            displayStatus = 'REJECTED';
          } else if (q.valid_until && new Date(q.valid_until).getTime() < Date.now()) {
            displayStatus = 'EXPIRED';
          } else if (q.status === 'accepted') {
            displayStatus = 'ACCEPTED';
          } else if (q.status === 'sent') {
            displayStatus = 'ACTIVE';
          } else {
            displayStatus = 'DRAFT';
          }
        }

        const itemsCount = Number(
          q.items_count ?? (Array.isArray(q.items) ? q.items.reduce((acc: number, item: any) => acc + (Number(item.qty) || 1), 0) : 0)
        );

        return {
          id: q.id,
          quoteNumber: q.quote_number,
          quoteType: (q.quote_type as 'wholesale' | 'direct') || (q.customer_company ? 'wholesale' : 'direct'),
          dealerId: q.dealer_id,
          customerName: q.customer_name || 'Walk-in Customer',
          customerCompany: q.customer_company,
          customerEmail: q.customer_email,
          customerPhone: q.customer_phone,
          customerAddress: q.customer_address,
          date: new Date(q.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          dueDate: q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
          validUntil: q.valid_until || '',
          items: Array.isArray(q.items) ? q.items : [],
          itemsCount,
          subtotal: q.subtotal || 0,
          taxAmount: q.tax_amount || 0,
          discountAmount: q.discount_amount || 0,
          discountType: (q.discount_type as 'flat' | 'percent') || 'flat',
          discountValue: q.discount_value !== undefined ? q.discount_value : (q.discount_amount || 0),
          totalAmount: q.total_amount || 0,
          notes: q.notes || '',
          status: q.status || 'draft',
          displayStatus,
          isConverted,
          linkedSaleId: q.linked_sale_id || null,
          linkedInvoiceNumber: q.linked_invoice_number || null,
          linkedPaymentStatus: q.linked_payment_status || null,
          linkedInvoiceRevokedAt: q.linked_invoice_revoked_at || null,
          voidedAt: q.voided_at || null,
          voidedBy: q.voided_by || null,
          voidReason: q.void_reason || null,
          voidNotes: q.void_notes || null,
        };
      });

      return {
        items: formatted,
        total: res.total || 0,
        totalPages: res.totalPages || 1,
      };
    },
    placeholderData: (prev, prevQuery) => {
      if (!prev || !prevQuery) return prev;
      const prevFilters = prevQuery.queryKey[2] as any;
      if (
        prevFilters?.search !== debouncedSearch ||
        prevFilters?.status !== (filterStatus === 'All' ? undefined : filterStatus.toLowerCase()) ||
        prevFilters?.quoteType !== (typeFilter === 'all' ? undefined : typeFilter) ||
        prevFilters?.sort !== sortFilter ||
        prevFilters?.pageSize !== pageSize
      ) {
        return undefined;
      }
      return prev;
    },
    staleTime: 30 * 1000,
  });

  const quotations = quotationsData?.items || [];
  const totalItems = quotationsData?.total || 0;
  const totalPages = quotationsData?.totalPages || 1;
  const [modalLoadingId, setModalLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (totalItems > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalItems, totalPages, page]);

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
    { name: '', qty: 1, unitPrice: 0, product_id: null },
  ]);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<'flat' | 'percent'>('flat');
  const [focusedLineItemIndex, setFocusedLineItemIndex] = useState<number | null>(null);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number>(-1);
  const blurTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced Selectors State
  const [dealerSearch, setDealerSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [dealerResults, setDealerResults] = useState<any[]>([]);
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [isDealerSearching, setIsDealerSearching] = useState(false);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);

  // Debounced Product Search State
  const [activeProductSuggestions, setActiveProductSuggestions] = useState<any[]>([]);
  const [isProductSearching, setIsProductSearching] = useState(false);

  // Bounded Caches
  const productCache = useRef(new Map<string, any[]>());
  const dealerCache = useRef(new Map<string, any[]>());
  const customerCache = useRef(new Map<string, any[]>());
  const selectedDealerIdRef = useRef<string | null>(null);

  const updateCache = (cache: React.MutableRefObject<Map<string, any[]>>, key: string, value: any[]) => {
    if (!cache.current.has(key) && cache.current.size >= 30) {
      const firstKey = cache.current.keys().next().value;
      if (firstKey) cache.current.delete(firstKey);
    }
    cache.current.set(key, value);
  };

  const focusedItemName = focusedLineItemIndex !== null ? lineItems[focusedLineItemIndex]?.name : undefined;

  useEffect(() => {
    if (focusedLineItemIndex === null || focusedItemName === undefined) {
      setActiveProductSuggestions([]);
      return;
    }
    const term = focusedItemName.trim();
    if (!term || term.length < 2) {
      setActiveProductSuggestions([]);
      return;
    }
    const cacheKey = term.toLowerCase();
    if (productCache.current.has(cacheKey)) {
      setActiveProductSuggestions(productCache.current.get(cacheKey) || []);
      setIsProductSearching(false);
      return;
    }

    let active = true;
    const delay = setTimeout(async () => {
      setIsProductSearching(true);
      const res = await searchQuotationProductsAction(term);
      if (active) {
        if (res.success && res.data) {
          updateCache(productCache, cacheKey, res.data);
          setActiveProductSuggestions(res.data);
        }
        setIsProductSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [focusedLineItemIndex, focusedItemName]);

  useEffect(() => {
    const term = dealerSearch.trim();
    if (term.length < 2) {
      setDealerResults([]);
      return;
    }
    const cacheKey = term.toLowerCase();
    if (dealerCache.current.has(cacheKey)) {
      setDealerResults(dealerCache.current.get(cacheKey) || []);
      setIsDealerSearching(false);
      return;
    }

    let active = true;
    const delay = setTimeout(async () => {
      setIsDealerSearching(true);
      const res = await searchQuotationDealersAction(term);
      if (active) {
        if (res.success && res.data) {
          updateCache(dealerCache, cacheKey, res.data);
          setDealerResults(res.data);
        }
        setIsDealerSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [dealerSearch]);

  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerResults([]);
      return;
    }
    const cacheKey = term.toLowerCase();
    if (customerCache.current.has(cacheKey)) {
      setCustomerResults(customerCache.current.get(cacheKey) || []);
      setIsCustomerSearching(false);
      return;
    }

    let active = true;
    const delay = setTimeout(async () => {
      setIsCustomerSearching(true);
      const res = await searchQuotationCustomersAction(term);
      if (active) {
        if (res.success && res.data) {
          updateCache(customerCache, cacheKey, res.data);
          setCustomerResults(res.data);
        }
        setIsCustomerSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [customerSearch]);



  // Convert to Sale / Invoice Modal State
  const [convertingQuote, setConvertingQuote] = useState<Quotation | null>(null);
  const [conversionMode, setConversionMode] = useState<'issue_only' | 'issue_with_payment'>('issue_only');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('due_on_receipt');
  const [customDueDate, setCustomDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bankName, setBankName] = useState<string>('');
  const [chequeNotes, setChequeNotes] = useState<string>('');
  const [convertedSale, setConvertedSale] = useState<{ saleId: string; receiptNumber?: string; invoiceNumber?: string } | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  // Void Quotation Modal State
  const [voidingQuote, setVoidingQuote] = useState<Quotation | null>(null);
  const [voidReason, setVoidReason] = useState<QuotationVoidReason>('CUSTOMER_CANCELLED');
  const [voidNotes, setVoidNotes] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // History Drawer State
  const [historyQuoteId, setHistoryQuoteId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const handleOpenHistory = async (quoteId: string) => {
    setHistoryQuoteId(quoteId);
    setIsHistoryLoading(true);
    setHistoryData(null);
    try {
      const res = await getQuotationHistoryAction(quoteId);
      if (res.success && res.data) {
        setHistoryData(res.data);
      } else {
        showToast(res.error || 'Failed to load quotation history', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error loading history', 'error');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!voidingQuote) return;
    if (voidReason === 'OTHER' && !voidNotes.trim()) {
      showToast('Notes are required when selecting "Other Reason".', 'error');
      return;
    }
    setIsVoiding(true);
    try {
      const res = await voidQuotationAction({
        quotationId: voidingQuote.id,
        reason: voidReason,
        notes: voidNotes.trim() || undefined,
      });
      if (res.success) {
        showToast('Quotation successfully marked as VOIDED.', 'success');
        setVoidingQuote(null);
        setVoidNotes('');
        refetchQuotations();
      } else {
        showToast(res.error || 'Failed to void quotation.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to void quotation.', 'error');
    } finally {
      setIsVoiding(false);
    }
  };

  // Issue Quotation Modal State
  const [issuingQuote, setIssuingQuote] = useState<Quotation | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);

  // Accept Quotation Modal State
  const [acceptingQuote, setAcceptingQuote] = useState<Quotation | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // Reject Quotation Modal State
  const [rejectingQuote, setRejectingQuote] = useState<Quotation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const handleConfirmIssue = async () => {
    if (!issuingQuote) return;
    setIsIssuing(true);
    try {
      const res = await issueQuotationAction(issuingQuote.id);
      if (res.success) {
        showToast(`Quotation #${issuingQuote.quoteNumber} issued! (Now Active)`, 'success');
        setIssuingQuote(null);
        refetchQuotations();
      } else {
        showToast(res.error || 'Failed to issue quotation.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to issue quotation.', 'error');
    } finally {
      setIsIssuing(false);
    }
  };

  const handleConfirmAccept = async () => {
    if (!acceptingQuote) return;
    setIsAccepting(true);
    try {
      const res = await acceptQuotationAction(acceptingQuote.id);
      if (res.success) {
        showToast(`Quotation #${acceptingQuote.quoteNumber} marked as Accepted! (Awaiting Invoice)`, 'success');
        setAcceptingQuote(null);
        refetchQuotations();
      } else {
        showToast(res.error || 'Failed to mark quotation as accepted.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark quotation as accepted.', 'error');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingQuote) return;
    setIsRejecting(true);
    try {
      const res = await rejectQuotationAction(rejectingQuote.id, rejectReason);
      if (res.success) {
        showToast(`Quotation #${rejectingQuote.quoteNumber} marked as Rejected.`, 'success');
        setRejectingQuote(null);
        setRejectReason('');
        refetchQuotations();
      } else {
        showToast(res.error || 'Failed to mark quotation as rejected.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark quotation as rejected.', 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  // Cleanup blur timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
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


  const handleSelectDealer = async (dealer: any) => {
    setSelectedDealerId(dealer.id);
    selectedDealerIdRef.current = dealer.id;
    setCustName(dealer.contact_name || dealer.company_name);
    setCustCompany(dealer.company_name);
    setCustEmail(dealer.email || '');
    setCustPhone(dealer.phone || '');
    if (dealer.address) setCustAddress(dealer.address);
    setDealerSearch('');
    setDealerResults([]);

    if (quoteType === 'wholesale' && !editingQuote) {
      const res = await getWholesaleDealerByIdAction(dealer.id);
      if (res.success && res.data && selectedDealerIdRef.current === dealer.id) {
        const discount = parseFloat(res.data.discount_rate);
        if (!isNaN(discount) && isFinite(discount) && discount >= 0 && discount <= 100) {
          setGlobalDiscount(discount);
          setGlobalDiscountType('percent');
        }
      }
    }
  };

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setCustName(customer.name);
    setCustCompany('');
    setCustEmail(customer.email || '');
    setCustPhone(customer.phone || '');
    if (customer.address) setCustAddress(customer.address);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const handleOpenModal = async (quote?: Quotation) => {
    let fullQuote = quote;

    if (quote) {
      setModalLoadingId(quote.id);
      try {
        const res = await getQuotationByIdAction(quote.id);
        if (!res.success || !res.data) throw new Error(res.error || 'Failed to load full quotation');
        const dbq = res.data;
        fullQuote = {
          ...quote,
          items: Array.isArray(dbq.items) ? dbq.items : [],
          subtotal: dbq.subtotal || 0,
          taxAmount: dbq.tax_amount || 0,
          discountAmount: dbq.discount_amount || 0,
          discountType: dbq.discount_type || 'flat',
          discountValue: dbq.discount_value !== undefined ? dbq.discount_value : (dbq.discount_amount || 0),
          notes: dbq.notes || '',
          customerAddress: dbq.customer_address || '',
          dealerId: dbq.dealer_id || '',
        };
      } catch (err: any) {
        showToast(err.message, 'error');
        setModalLoadingId(null);
        return;
      }
      setModalLoadingId(null);
    }

    setDealerSearch('');
    setCustomerSearch('');
    setDealerResults([]);
    setCustomerResults([]);
    setActiveProductSuggestions([]);
    setFocusedLineItemIndex(null);

    setEditingQuote(fullQuote || null);
    setFormStep(1);
    if (fullQuote) {
      setQuoteType(fullQuote.quoteType || 'wholesale');
      setSelectedDealerId(fullQuote.dealerId || '');
      setSelectedCustomerId('');
      setCustName(fullQuote.customerName || '');
      setCustCompany(fullQuote.customerCompany || '');
      setCustEmail(fullQuote.customerEmail || '');
      setCustPhone(fullQuote.customerPhone || '');
      setCustAddress(fullQuote.customerAddress || '');
      setNotes(fullQuote.notes || '');
      const remaining = fullQuote.validUntil
        ? Math.max(1, Math.round((new Date(fullQuote.validUntil).getTime() - Date.now()) / 86400000))
        : 14;
      setValidDays(remaining);
      setLineItems(
        fullQuote.items && fullQuote.items.length > 0
          ? fullQuote.items.map((it: any) => ({
              ...it,
              product_id: it.product_id || it.productId || null,
              name: it.name || '',
              qty: it.qty || it.quantity || 1,
              unitPrice: it.unitPrice || it.unit_price || 0,
            }))
          : [{ name: '', qty: 1, unitPrice: 0, product_id: null }]
      );
      setGlobalDiscount(fullQuote.discountValue !== undefined ? fullQuote.discountValue : (fullQuote.discountAmount || 0));
      setGlobalDiscountType(fullQuote.discountType || 'flat');
    } else {
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
      setLineItems([{ name: '', qty: 1, unitPrice: 0, product_id: null }]);
      setGlobalDiscount(0);
      setGlobalDiscountType('flat');
    }
    setFormStep(1);
    setIsModalOpen(true);
  };

  const handleAddLineItem = () => {
    setLineItems((prev) => [...prev, { name: '', qty: 1, unitPrice: 0, product_id: null }]);
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
          const cleanPid = i.product_id && typeof i.product_id === 'string' && /^[0-9a-f-]{36}$/i.test(i.product_id.trim())
            ? i.product_id.trim()
            : null;
          return {
            ...i,
            product_id: cleanPid,
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
        refetchQuotations();
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
        refetchQuotations();
      } else {
        showToast(res.error || 'Failed to delete quotation.', 'error');
      }
    });
  };

  const handleConvertQuotation = () => {
    if (!convertingQuote) return;

    let numAmount = 0;
    if (conversionMode === 'issue_with_payment') {
      numAmount = parseFloat(amountPaid);
      if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
        showToast('Please enter a valid positive amount paid.', 'error');
        return;
      }
      if (numAmount > convertingQuote.totalAmount) {
        showToast(`Amount paid cannot exceed quotation total (${fmt(convertingQuote.totalAmount)}).`, 'error');
        return;
      }

      if (paymentMethod === 'cheque') {
        if (!chequeNumber.trim()) {
          showToast('Cheque number is required for cheque payments.', 'error');
          return;
        }
        if (!chequeDate) {
          showToast('Cheque date is required for cheque payments.', 'error');
          return;
        }
        if (!bankName.trim()) {
          showToast('Bank name is required for cheque payments.', 'error');
          return;
        }
      }
    }

    startTransition(async () => {
      const res = await convertQuotationToSaleAction(
        convertingQuote.id,
        conversionMode === 'issue_with_payment' ? paymentMethod : null,
        numAmount,
        (conversionMode === 'issue_with_payment' && paymentMethod === 'cheque')
          ? {
              chequeNumber: chequeNumber.trim(),
              chequeDate,
              bankName: bankName.trim(),
              notes: chequeNotes.trim() || undefined,
            }
          : undefined,
        paymentTerms,
        paymentTerms === 'custom' ? customDueDate : undefined
      );

      if (res.success && res.saleId) {
        const invOrReceipt = res.invoiceNumber || res.receiptNumber || 'INV';
        if (conversionMode === 'issue_only') {
          showToast(`Invoice #${invOrReceipt} issued successfully (UNPAID)!`);
        } else if (paymentMethod === 'cheque') {
          showToast(`Invoice #${invOrReceipt} issued! Cheque recorded (Pending Clearance).`);
        } else if (numAmount < convertingQuote.totalAmount) {
          showToast(`Invoice #${invOrReceipt} issued with partial payment of ${fmt(numAmount)} (Balance Pending).`);
        } else {
          showToast(`Invoice #${invOrReceipt} issued and marked Paid!`);
        }
        setConvertedSale({
          saleId: res.saleId,
          receiptNumber: res.receiptNumber,
          invoiceNumber: res.invoiceNumber,
        });
        refetchQuotations();
      } else {
        showToast(res.error || 'Failed to issue invoice.', 'error');
      }
    });
  };

  const handlePrintQuotation = async (quote: Quotation) => {
    const res = await getQuotationByIdAction(quote.id);
    if (!res.success || !res.data) {
      showToast(res.error || 'Failed to load full quotation for printing.', 'error');
      return;
    }
    const fullQuote = res.data;
    const cfg = await resolveInvoiceConfig();

    const invoiceData: InvoiceData = {
      docType: 'Quotation',
      docNumber: fullQuote.quote_number,
      date: new Date(fullQuote.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      dueDate: fullQuote.valid_until ? new Date(fullQuote.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      customerName: fullQuote.customer_name,
      customerCompany: fullQuote.customer_company,
      customerPhone: fullQuote.customer_phone,
      customerAddress: fullQuote.customer_address,
      items: (Array.isArray(fullQuote.items) ? fullQuote.items : []).map((i: any) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice || i.unit_price,
      })),
      subtotal: fullQuote.subtotal,
      taxAmount: fullQuote.tax_amount,
      discountAmount: fullQuote.discount_amount,
      totalAmount: fullQuote.total_amount,
      notes: fullQuote.notes,
    };

    printInvoice(cfg, invoiceData, `Quotation — ${fullQuote.quote_number}`);
  };

  const handlePrintConvertedPaidInvoice = async (quote: Quotation, receiptNo?: string, invoiceNo?: string) => {
    const res = await getQuotationByIdAction(quote.id);
    if (!res.success || !res.data) {
      showToast(res.error || 'Failed to load full invoice details for printing.', 'error');
      return;
    }
    const fullQuote = res.data;
    const cfg = await resolveInvoiceConfig();

    const invoiceData: InvoiceData = {
      docType: 'Invoice',
      docNumber: invoiceNo || receiptNo || `INV-${fullQuote.quote_number}`,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      customerName: fullQuote.customer_name,
      customerCompany: fullQuote.customer_company,
      customerPhone: fullQuote.customer_phone,
      customerAddress: fullQuote.customer_address,
      items: (Array.isArray(fullQuote.items) ? fullQuote.items : []).map((i: any) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice || i.unit_price,
      })),
      subtotal: fullQuote.subtotal,
      taxAmount: fullQuote.tax_amount,
      discountAmount: fullQuote.discount_amount,
      totalAmount: fullQuote.total_amount,
      paymentTerms,
      notes: fullQuote.notes,
    };

    printInvoice(cfg, invoiceData, `Invoice — ${invoiceData.docNumber}`);
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
        refetchQuotations();
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
          <h2 className="text-2xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <FileText className="h-6 w-6 text-amber-500" /> Quotations
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Create Wholesale B2B or Direct Customer quotations, link existing dealers/customers, and convert accepted quotes to Commercial Invoices.
          </p>
        </div>

        <Button
          onClick={() => handleOpenModal()}
          disabled={modalLoadingId !== null}
          className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-1.5 shadow-lg shadow-amber-500/10 text-xs"
        >
          {modalLoadingId === 'create' ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Preparing...</>
          ) : (
            <><Plus className="h-4 w-4" /> Create Quotation</>
          )}
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

          {/* Sort Filter */}
          <select
            value={sortFilter}
            onChange={(e) => setSortFilter(e.target.value as 'newest' | 'oldest')}
            className="bg-background border border-input rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          {/* Status Filter */}
          {(['All', 'Draft', 'Active', 'Accepted', 'Converted', 'Rejected', 'Expired', 'Voided'] as const).map((status) => (
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
                      <button
                        type="button"
                        onClick={() => handleOpenHistory(quote.id)}
                        className="font-mono font-bold text-amber-500 hover:text-amber-400 hover:underline flex items-center gap-1 text-sm cursor-pointer text-left"
                        title="View Quotation Lifecycle History"
                      >
                        <span>{quote.quoteNumber}</span>
                        <History className="h-3 w-3 opacity-60 hover:opacity-100" />
                      </button>
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
                      {quote.quoteType === 'wholesale' && quote.customerCompany ? (
                        <div>
                          <p className="font-bold text-foreground text-sm leading-tight">{quote.customerCompany}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <span className="font-medium text-foreground/80">{quote.customerName}</span>
                            {quote.customerPhone && (
                              <>
                                <span className="text-muted-foreground/60">·</span>
                                <span className="font-mono text-muted-foreground">{quote.customerPhone}</span>
                              </>
                            )}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-foreground text-sm leading-tight">{quote.customerName}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            {quote.customerCompany && <span>{quote.customerCompany}</span>}
                            {quote.customerCompany && (quote.customerEmail || quote.customerPhone) && (
                              <span className="text-muted-foreground/60">·</span>
                            )}
                            {quote.customerEmail && <span>{quote.customerEmail}</span>}
                            {quote.customerEmail && quote.customerPhone && (
                              <span className="text-muted-foreground/60">·</span>
                            )}
                            {quote.customerPhone && <span className="font-mono">{quote.customerPhone}</span>}
                          </p>
                        </div>
                      )}
                    </td>

                    <td className="p-4 font-mono text-foreground font-semibold">{quote.dueDate}</td>

                    <td className="p-4 text-right font-bold text-foreground">
                      {quote.itemsCount > 0 ? `${quote.itemsCount} ${quote.itemsCount === 1 ? 'item' : 'items'}` : '—'}
                    </td>

                    <td className="p-4 text-right font-black text-foreground text-sm">
                      {fmt(quote.totalAmount)}
                    </td>

                    <td className="p-4 text-center">
                      {quote.displayStatus === 'CONVERTED' ? (
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <CheckCircle2 className="h-3 w-3" /> CONVERTED
                          </span>
                          {quote.linkedInvoiceNumber && (
                            <span
                              className="font-mono text-[10px] text-muted-foreground hover:text-foreground cursor-pointer underline decoration-dotted"
                              onClick={() => onNavigateTab?.('sales', { id: quote.linkedSaleId || undefined, search: quote.linkedInvoiceNumber! })}
                              title="Click to view linked invoice in Sales"
                            >
                              {quote.linkedInvoiceNumber}
                            </span>
                          )}
                          {quote.linkedInvoiceRevokedAt ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              REVOKED
                            </span>
                          ) : quote.linkedPaymentStatus ? (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                quote.linkedPaymentStatus === 'paid'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : quote.linkedPaymentStatus === 'partial'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-red-500/15 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {quote.linkedPaymentStatus === 'partial' ? 'BALANCE PENDING' : quote.linkedPaymentStatus}
                            </span>
                          ) : null}
                        </div>
                      ) : quote.displayStatus === 'VOIDED' ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-zinc-800 border border-zinc-700 text-zinc-300">
                            <XCircle className="h-3 w-3 text-red-400" /> VOIDED
                          </span>
                          {quote.voidReason && (
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {quote.voidReason.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      ) : quote.displayStatus === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 border border-red-500/20 text-red-400">
                          <XCircle className="h-3 w-3" /> REJECTED
                        </span>
                      ) : quote.displayStatus === 'EXPIRED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-muted text-muted-foreground border border-border">
                          <AlertCircle className="h-3 w-3" /> EXPIRED
                        </span>
                      ) : quote.displayStatus === 'ACCEPTED' ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> ACCEPTED
                          </span>
                          <span className="text-[10px] text-amber-400/90 font-medium">Awaiting Invoice</span>
                        </div>
                      ) : quote.displayStatus === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                          <Clock className="h-3 w-3" /> ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-500/10 border border-zinc-500/20 text-zinc-400">
                          <FileText className="h-3 w-3" /> DRAFT
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                        {/* 1. DRAFT: Primary Issue Quotation + Edit */}
                        {quote.displayStatus === 'DRAFT' && !quote.isConverted && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setIssuingQuote(quote)}
                              className="h-8 text-[11px] font-bold gap-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-xs cursor-pointer"
                              title="Formally Issue Quotation to Customer (Draft → Active)"
                            >
                              <Send className="h-3.5 w-3.5" /> Issue Quotation
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenModal(quote)}
                              disabled={modalLoadingId !== null}
                              className="h-8 text-[11px] font-bold gap-1 rounded-lg border-border hover:bg-muted text-foreground cursor-pointer"
                              title="Edit Quotation"
                            >
                              {modalLoadingId === quote.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Edit className="h-3.5 w-3.5" />
                              )}
                              <span>Edit</span>
                            </Button>
                          </>
                        )}

                        {/* 2. ACTIVE or ACCEPTED: Primary Issue Invoice + Issue & Pay */}
                        {(quote.displayStatus === 'ACTIVE' || quote.displayStatus === 'ACCEPTED') && !quote.isConverted && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setConvertingQuote(quote);
                                setConversionMode('issue_only');
                                setConvertedSale(null);
                                setPaymentTerms('due_on_receipt');
                                setAmountPaid('0');
                              }}
                              className="h-8 text-[11px] font-bold gap-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs cursor-pointer"
                              title="Issue Commercial Invoice (Zero Initial Payment)"
                            >
                              <FileText className="h-3.5 w-3.5" /> Issue Invoice
                            </Button>

                            <Button
                              size="sm"
                              onClick={() => {
                                setConvertingQuote(quote);
                                setConversionMode('issue_with_payment');
                                setConvertedSale(null);
                                setPaymentTerms('due_on_receipt');
                                setPaymentMethod('cash');
                                setAmountPaid(String(quote.totalAmount || 0));
                                setChequeNumber('');
                                setChequeDate(new Date().toISOString().split('T')[0]);
                                setBankName('');
                                setChequeNotes('');
                              }}
                              className="h-8 text-[11px] font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer"
                              title="Issue Invoice & Record Initial Payment"
                            >
                              <ArrowRightCircle className="h-3.5 w-3.5" /> Issue & Pay
                            </Button>
                          </>
                        )}

                        {/* 3. CONVERTED: Primary View Invoice */}
                        {quote.displayStatus === 'CONVERTED' && quote.linkedInvoiceNumber && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onNavigateTab?.('sales', { id: quote.linkedSaleId || undefined, search: quote.linkedInvoiceNumber! })}
                            className="h-8 text-[11px] font-bold gap-1 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 rounded-lg cursor-pointer"
                            title={`View Commercial Invoice #${quote.linkedInvoiceNumber} in Sales`}
                          >
                            <Receipt className="h-3.5 w-3.5" /> View Invoice
                          </Button>
                        )}

                        {/* 4. REJECTED / EXPIRED / VOIDED: Print Quotation */}
                        {(quote.displayStatus === 'REJECTED' || quote.displayStatus === 'EXPIRED' || quote.displayStatus === 'VOIDED') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintQuotation(quote)}
                            className="h-8 text-[11px] font-bold gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 rounded-lg cursor-pointer"
                            title="Print Quotation"
                          >
                            <Printer className="h-3.5 w-3.5" /> Print
                          </Button>
                        )}

                        {/* 5. Clean Overflow Dropdown (⋯) for Secondary Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="h-8 w-8 p-0 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center cursor-pointer transition-colors"
                            title="More Options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-card border border-border shadow-xl rounded-xl p-1 text-xs">
                            {/* View History */}
                            <DropdownMenuItem
                              onClick={() => handleOpenHistory(quote.id)}
                              className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-muted"
                            >
                              <History className="h-3.5 w-3.5 text-amber-500" />
                              <span>View History</span>
                            </DropdownMenuItem>

                            {/* Print Quotation (if not primary) */}
                            {quote.displayStatus !== 'REJECTED' && quote.displayStatus !== 'EXPIRED' && quote.displayStatus !== 'VOIDED' && (
                              <DropdownMenuItem
                                onClick={() => handlePrintQuotation(quote)}
                                className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-muted"
                              >
                                <Printer className="h-3.5 w-3.5 text-amber-400" />
                                <span>Print Quotation</span>
                              </DropdownMenuItem>
                            )}

                            {/* Email Quotation (ACTIVE or ACCEPTED) */}
                            {(quote.displayStatus === 'ACTIVE' || quote.displayStatus === 'ACCEPTED') && quote.customerEmail && (
                              <DropdownMenuItem
                                onClick={() => handleSendEmail(quote)}
                                disabled={sendingEmailId === quote.id || isPending}
                                className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-muted"
                              >
                                {sendingEmailId === quote.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                                ) : (
                                  <Mail className="h-3.5 w-3.5 text-blue-400" />
                                )}
                                <span>Email Quotation</span>
                              </DropdownMenuItem>
                            )}

                            {/* Mark Accepted (ONLY for ACTIVE) */}
                            {quote.displayStatus === 'ACTIVE' && (
                              <DropdownMenuItem
                                onClick={() => setAcceptingQuote(quote)}
                                className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-emerald-500/10 text-emerald-400"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Mark Accepted</span>
                              </DropdownMenuItem>
                            )}

                            {/* Mark Rejected (ACTIVE or ACCEPTED) */}
                            {(quote.displayStatus === 'ACTIVE' || quote.displayStatus === 'ACCEPTED') && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setRejectingQuote(quote);
                                  setRejectReason('');
                                }}
                                className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-rose-500/10 text-rose-400"
                              >
                                <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                <span>Mark Rejected</span>
                              </DropdownMenuItem>
                            )}

                            {/* Void Quotation (ACTIVE or ACCEPTED) */}
                            {(quote.displayStatus === 'ACTIVE' || quote.displayStatus === 'ACCEPTED') && (
                              <>
                                <DropdownMenuSeparator className="my-1 bg-border/60" />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setVoidingQuote(quote);
                                    setVoidReason('CUSTOMER_CANCELLED');
                                    setVoidNotes('');
                                  }}
                                  className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-red-500/10 text-red-500"
                                >
                                  <Ban className="h-3.5 w-3.5 text-red-500" />
                                  <span>Void Quotation</span>
                                </DropdownMenuItem>
                              </>
                            )}

                            {/* Delete Draft (DRAFT ONLY) */}
                            {quote.displayStatus === 'DRAFT' && !quote.isConverted && (
                              <>
                                <DropdownMenuSeparator className="my-1 bg-border/60" />
                                <DropdownMenuItem
                                  onClick={() => handleDeleteQuotation(quote.id)}
                                  className="flex items-center gap-2 cursor-pointer font-medium py-1.5 px-2 rounded-lg hover:bg-red-500/10 text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  <span>Delete Draft</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {!isQuotationsLoading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <div className="flex items-center gap-4">
              <div className="text-xs text-muted-foreground font-medium">
                Showing <span className="text-foreground font-bold">
                  {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}
                  {totalItems === 0 ? '' : '–'}
                  {totalItems === 0 ? '' : Math.min(page * pageSize, totalItems)}
                </span> of <span className="text-foreground font-bold">{totalItems}</span> quotations
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  disabled={isQuotationsFetching}
                  className="bg-background border border-border rounded text-xs px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
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
            )}
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
                      if (!editingQuote) {
                        setGlobalDiscount(0);
                        setGlobalDiscountType('flat');
                      }
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
                  <div className="relative">
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Search Wholesale Dealer (Type at least 2 chars)
                    </label>
                    <Input
                      placeholder="Search by company or name..."
                      value={dealerSearch}
                      onChange={(e) => setDealerSearch(e.target.value)}
                      className="text-xs bg-background"
                    />
                    {dealerSearch.trim().length === 1 && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                        Type at least 2 characters to search...
                      </div>
                    )}
                    {dealerSearch.trim().length >= 2 && isDealerSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                      </div>
                    )}
                    {dealerSearch.trim().length >= 2 && dealerResults.length === 0 && !isDealerSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                        No dealers found.
                      </div>
                    )}
                    {dealerResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-auto">
                        {dealerResults.map((d) => (
                          <li
                            key={d.id}
                            className="p-2 text-xs hover:bg-muted cursor-pointer flex justify-between"
                            onClick={() => handleSelectDealer(d)}
                          >
                            <span>{d.company_name} ({d.contact_name})</span>
                            <span className="text-muted-foreground">{d.phone}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <label className="text-[11px] font-bold text-foreground block mb-1">
                      Search Existing Customer (Type at least 2 chars)
                    </label>
                    <Input
                      placeholder="Search by name, email or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="text-xs bg-background"
                    />
                    {customerSearch.trim().length === 1 && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                        Type at least 2 characters to search...
                      </div>
                    )}
                    {customerSearch.trim().length >= 2 && isCustomerSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                      </div>
                    )}
                    {customerSearch.trim().length >= 2 && customerResults.length === 0 && !isCustomerSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                        No customers found.
                      </div>
                    )}
                    {customerResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-auto">
                        {customerResults.map((c) => (
                          <li
                            key={c.id}
                            className="p-2 text-xs hover:bg-muted cursor-pointer flex justify-between"
                            onClick={() => handleSelectCustomer(c)}
                          >
                            <span>{c.name}</span>
                            <span className="text-muted-foreground">{c.phone || c.email}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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
                          const suggestions = focusedLineItemIndex === idx ? activeProductSuggestions : [];

                          const selectProduct = (prod: any) => {
                            const retailPrice = Number(prod.discount_price || prod.discountPrice || prod.price) || 0;
                            setLineItems((prev) => {
                              const updated = [...prev];
                              updated[idx] = {
                                ...updated[idx],
                                product_id: prod.id,
                                name: prod.name,
                                unitPrice: retailPrice,
                              };
                              return updated;
                            });
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
                                  setLineItems((prev) => {
                                    const updated = [...prev];
                                    const currentItem = updated[idx];
                                    updated[idx] = {
                                      ...currentItem,
                                      name: e.target.value,
                                      product_id: null, // Clear product_id on manual name typing to prevent stale catalog association
                                    };
                                    return updated;
                                  });
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
                              {item.product_id && (
                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-emerald-500 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  <span>Catalog Linked</span>
                                </div>
                              )}
                              {focusedLineItemIndex === idx && term.length === 1 && (
                                <div className="absolute z-50 left-0 top-full mt-1 w-[160%] min-w-[320px] max-w-[500px] bg-background border border-border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                                  Type at least 2 characters to search...
                                </div>
                              )}
                              {focusedLineItemIndex === idx && term.length >= 2 && isProductSearching && (
                                <div className="absolute z-50 left-0 top-full mt-1 w-[160%] min-w-[320px] max-w-[500px] bg-background border border-border rounded-lg p-2 text-xs text-muted-foreground shadow-lg flex items-center gap-2">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Searching...
                                </div>
                              )}
                              {focusedLineItemIndex === idx && term.length >= 2 && !isProductSearching && suggestions.length === 0 && (
                                <div className="absolute z-50 left-0 top-full mt-1 w-[160%] min-w-[320px] max-w-[500px] bg-background border border-border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                                  No products found.
                                </div>
                              )}
                              {focusedLineItemIndex === idx && suggestions.length > 0 && (
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
                                            <span>RT: {fmt(prod.discountPrice || prod.discount_price || prod.price)}</span>
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

      {/* Convert Quotation to Invoice Modal */}
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
            aria-label={conversionMode === 'issue_only' ? 'Issue Commercial Invoice' : 'Issue Invoice & Record Payment'}
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
              <div className={`h-12 w-12 rounded-full flex items-center justify-center mx-auto ${
                conversionMode === 'issue_only'
                  ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-500'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
              }`}>
                {conversionMode === 'issue_only' ? (
                  <FileText className="h-6 w-6" />
                ) : (
                  <ShoppingBag className="h-6 w-6" />
                )}
              </div>

              <div>
                <h3 className="text-base font-black text-foreground">
                  {conversionMode === 'issue_only' ? 'Issue Commercial Invoice' : 'Issue Invoice & Record Payment'}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Converting Quotation <strong className="text-amber-400">#{convertingQuote.quoteNumber}</strong> for <strong className="text-foreground">{convertingQuote.customerName}</strong>
                </p>
              </div>

              {!convertedSale ? (
                <>
                  {/* Mode Toggle Pills */}
                  <div className="flex bg-muted/40 p-1 rounded-xl border border-border/60">
                    <button
                      type="button"
                      onClick={() => setConversionMode('issue_only')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        conversionMode === 'issue_only'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Issue Invoice (0 Paid)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConversionMode('issue_with_payment')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        conversionMode === 'issue_with_payment'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Issue & Record Payment
                    </button>
                  </div>

                  {/* Payment Terms Selector */}
                  <div className="text-left space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-foreground block">Payment Terms:</label>
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        Due:{' '}
                        <strong className="text-foreground">
                          {(() => {
                            const now = new Date();
                            if (paymentTerms === 'net_7') now.setDate(now.getDate() + 7);
                            else if (paymentTerms === 'net_14') now.setDate(now.getDate() + 14);
                            else if (paymentTerms === 'net_30') now.setDate(now.getDate() + 30);
                            else if (paymentTerms === 'custom') return customDueDate || 'Custom';
                            return now.toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' });
                          })()}
                        </strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {([
                        { id: 'due_on_receipt', label: 'Receipt' },
                        { id: 'net_7', label: 'Net 7' },
                        { id: 'net_14', label: 'Net 14' },
                        { id: 'net_30', label: 'Net 30' },
                        { id: 'custom', label: 'Custom' },
                      ] as const).map((t) => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => setPaymentTerms(t.id)}
                          className={`py-1.5 px-1 rounded-lg border text-[11px] font-bold transition-colors ${
                            paymentTerms === t.id
                              ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                              : 'bg-background border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {paymentTerms === 'custom' && (
                      <div className="pt-1.5">
                        <label className="text-[11px] font-bold text-foreground block mb-1">Custom Due Date:</label>
                        <Input
                          type="date"
                          value={customDueDate}
                          onChange={(e) => setCustomDueDate(e.target.value)}
                          className="text-xs bg-background"
                          required
                        />
                      </div>
                    )}
                  </div>

                  {/* Financial Snapshot */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/30 border border-border/50 rounded-xl p-3 text-left">
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Invoice Total</span>
                      <span className="text-xs font-black text-foreground">{fmt(convertingQuote.totalAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Initial Payment</span>
                      <span className="text-xs font-black text-emerald-500">
                        {conversionMode === 'issue_only' ? 'LKR 0' : fmt(parseFloat(amountPaid) || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Pending Clear</span>
                      <span className="text-xs font-black text-amber-500">
                        {conversionMode === 'issue_with_payment' && paymentMethod === 'cheque'
                          ? fmt(parseFloat(amountPaid) || 0)
                          : 'LKR 0'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Balance Due</span>
                      <span className="text-xs font-black text-primary">
                        {conversionMode === 'issue_only'
                          ? fmt(convertingQuote.totalAmount)
                          : fmt(Math.max(0, convertingQuote.totalAmount - (paymentMethod === 'cheque' ? 0 : (parseFloat(amountPaid) || 0))))}
                      </span>
                    </div>
                  </div>

                  {/* Payment Inputs for Issue & Pay mode */}
                  {conversionMode === 'issue_with_payment' && (
                    <>
                      {/* Payment Method Selector */}
                      <div className="text-left space-y-1.5">
                        <label className="text-xs font-bold text-foreground block">Payment Method:</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['cash', 'card', 'cheque'] as const).map((method) => (
                            <button
                              type="button"
                              key={method}
                              onClick={() => setPaymentMethod(method)}
                              className={`p-2 rounded-xl border text-xs font-bold uppercase transition-colors flex items-center justify-center gap-1.5 ${
                                paymentMethod === method
                                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm'
                                  : 'bg-background border-border text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              {method === 'cash' && <Banknote className="w-3.5 h-3.5" />}
                              {method === 'card' && <CreditCard className="w-3.5 h-3.5" />}
                              {method === 'cheque' && <FileText className="w-3.5 h-3.5" />}
                              {method}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Amount Paid */}
                      <div className="text-left space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-foreground block">Initial Payment (LKR):</label>
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Available to Record: <strong className="text-foreground">{fmt(convertingQuote.totalAmount)}</strong>
                          </span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">LKR</span>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0.00"
                            value={amountPaid}
                            onChange={(e) => setAmountPaid(e.target.value)}
                            className="pl-12 text-sm font-bold bg-background text-foreground"
                          />
                        </div>
                      </div>

                      {/* Cheque Specific Fields */}
                      {paymentMethod === 'cheque' && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3.5 text-left space-y-2.5 animate-in fade-in duration-150">
                          <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold pb-1 border-b border-amber-500/15">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Cheque Payment Details (Pending Clearance)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-bold text-foreground block mb-1">Cheque Number *</label>
                              <Input
                                type="text"
                                placeholder="e.g. 000123456"
                                value={chequeNumber}
                                onChange={(e) => setChequeNumber(e.target.value)}
                                className="text-xs bg-background font-mono"
                                required
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-foreground block mb-1">Cheque Date *</label>
                              <Input
                                type="date"
                                value={chequeDate}
                                onChange={(e) => setChequeDate(e.target.value)}
                                className="text-xs bg-background"
                                required
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-foreground block mb-1">Bank Name *</label>
                            <Input
                              type="text"
                              placeholder="e.g. Commercial Bank of Ceylon"
                              value={bankName}
                              onChange={(e) => setBankName(e.target.value)}
                              className="text-xs bg-background"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-foreground block mb-1">Cheque Details / Notes</label>
                            <Input
                              type="text"
                              placeholder="Branch or deposit instructions (optional)"
                              value={chequeNotes}
                              onChange={(e) => setChequeNotes(e.target.value)}
                              className="text-xs bg-background"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {conversionMode === 'issue_only' && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-xs text-left text-indigo-300">
                      An official invoice will be generated and marked <strong className="text-white font-bold">UNPAID</strong>. The full balance of <strong className="text-white font-bold">{fmt(convertingQuote.totalAmount)}</strong> will be tracked under Outstanding Receivables.
                    </div>
                  )}

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
                      disabled={
                        isPending ||
                        (conversionMode === 'issue_with_payment' && (
                          isNaN(parseFloat(amountPaid)) ||
                          parseFloat(amountPaid) <= 0 ||
                          parseFloat(amountPaid) > convertingQuote.totalAmount ||
                          (paymentMethod === 'cheque' && (!chequeNumber.trim() || !chequeDate || !bankName.trim()))
                        ))
                      }
                      className={`h-9 px-5 rounded-xl font-bold text-xs text-white shadow-sm ${
                        conversionMode === 'issue_only'
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {isPending
                        ? 'Processing...'
                        : conversionMode === 'issue_only'
                        ? 'Issue Commercial Invoice'
                        : 'Issue Invoice & Record Payment'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400 font-bold">
                    ✓ Invoice #{convertedSale.invoiceNumber || convertedSale.receiptNumber || convertedSale.saleId} successfully issued!
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      onClick={() => handlePrintConvertedPaidInvoice(convertingQuote, convertedSale.receiptNumber, convertedSale.invoiceNumber)}
                      className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4" /> Print Commercial Invoice
                    </Button>
                    {onNavigateTab && (
                      <Button
                        onClick={() => {
                          const targetInv = convertedSale.invoiceNumber || convertedSale.receiptNumber || '';
                          setConvertingQuote(null);
                          setConvertedSale(null);
                          onNavigateTab('sales', { id: convertedSale.saleId, search: targetInv });
                        }}
                        className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Receipt className="h-4 w-4" /> View in Sales Tab
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setConvertingQuote(null);
                        setConvertedSale(null);
                      }}
                      className="h-9 px-4 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Issue Quotation Confirmation Modal */}
      {issuingQuote && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isIssuing && setIssuingQuote(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Issue Quotation"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-amber-500/10">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-black text-foreground">
                  Issue Quotation #{issuingQuote.quoteNumber}?
                </h3>
              </div>
              <button
                onClick={() => !isIssuing && setIssuingQuote(null)}
                disabled={isIssuing}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">{issuingQuote.quoteNumber}</strong> will be formally issued to the customer and moved from <strong>Draft</strong> to <strong>Active</strong>.
              </p>
              <div className="p-3 bg-muted/40 rounded-xl border border-border text-[11px] text-muted-foreground space-y-1">
                <p>• Quotation becomes active and awaiting customer decision.</p>
                <p>• Zero inventory mutation is performed.</p>
                <p>• You can optionally email the quotation after issuance.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                disabled={isIssuing}
                onClick={() => setIssuingQuote(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isIssuing}
                onClick={handleConfirmIssue}
                className="text-xs font-bold gap-1.5 cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isIssuing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Issue Quotation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Accept Quotation Confirmation Modal */}
      {acceptingQuote && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isAccepting && setAcceptingQuote(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Accept Quotation"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="text-sm font-black text-foreground">
                  Accept Quotation #{acceptingQuote.quoteNumber}?
                </h3>
              </div>
              <button
                onClick={() => !isAccepting && setAcceptingQuote(null)}
                disabled={isAccepting}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">{acceptingQuote.quoteNumber}</strong> will be marked as accepted by the customer. It will enter the <strong className="text-emerald-500">ACCEPTED (Awaiting Invoice)</strong> stage.
              </p>
              <div className="p-3 bg-muted/40 rounded-xl border border-border text-[11px] text-muted-foreground space-y-1">
                <p>• Commercial pricing and items snapshot remain locked.</p>
                <p>• Ready for formal invoicing via Issue Invoice or Issue &amp; Pay.</p>
                <p>• Zero inventory mutation until an invoice is issued.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                disabled={isAccepting}
                onClick={() => setAcceptingQuote(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isAccepting}
                onClick={handleConfirmAccept}
                className="text-xs font-bold gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isAccepting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Mark Accepted
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Quotation Confirmation Modal */}
      {rejectingQuote && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isRejecting && setRejectingQuote(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Reject Quotation"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-destructive/10">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <h3 className="text-sm font-black text-foreground">
                  Reject Quotation #{rejectingQuote.quoteNumber}?
                </h3>
              </div>
              <button
                onClick={() => !isRejecting && setRejectingQuote(null)}
                disabled={isRejecting}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This quotation will be marked as <strong className="text-destructive">REJECTED</strong> and moved to historical records. It cannot be converted into an invoice.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Reason for Rejection <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Customer declined offer, price too high, competitor chosen, etc."
                  className="w-full bg-background border border-input rounded-lg p-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                disabled={isRejecting}
                onClick={() => setRejectingQuote(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isRejecting}
                onClick={handleConfirmReject}
                className="text-xs font-bold gap-1.5 cursor-pointer"
              >
                {isRejecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Mark Rejected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Void Quotation Confirmation Modal */}
      {voidingQuote && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isVoiding && setVoidingQuote(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Void Quotation"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-destructive/10">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-destructive" />
                <h3 className="text-sm font-black text-foreground">
                  Void Quotation #{voidingQuote.quoteNumber}
                </h3>
              </div>
              <button
                onClick={() => !isVoiding && setVoidingQuote(null)}
                disabled={isVoiding}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This quotation will be permanently marked as <strong className="text-foreground">VOIDED</strong> and retained in the commercial history. It cannot be converted to an invoice or edited.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Void Reason <span className="text-destructive">*</span>
                </label>
                <select
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value as QuotationVoidReason)}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30"
                >
                  {VOID_REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Notes / Explanation {voidReason === 'OTHER' && <span className="text-destructive">*</span>}
                </label>
                <textarea
                  value={voidNotes}
                  onChange={(e) => setVoidNotes(e.target.value)}
                  rows={3}
                  placeholder={voidReason === 'OTHER' ? 'Please explain why this quotation is being voided (Required)...' : 'Optional internal notes...'}
                  className="w-full bg-background border border-input rounded-lg p-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                disabled={isVoiding}
                onClick={() => setVoidingQuote(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isVoiding || (voidReason === 'OTHER' && !voidNotes.trim())}
                onClick={handleConfirmVoid}
                className="text-xs font-bold gap-1.5 cursor-pointer"
              >
                {isVoiding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Void
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View History Drawer */}
      {historyQuoteId && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end"
          onClick={() => setHistoryQuoteId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quotation History"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border-l border-border w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-amber-500" />
                <div>
                  <h3 className="text-sm font-black text-foreground">
                    Quotation Lifecycle & History
                  </h3>
                  {historyData?.quotation && (
                    <p className="text-[11px] font-mono text-muted-foreground">
                      #{historyData.quotation.quote_number}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setHistoryQuoteId(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isHistoryLoading ? (
                <div className="py-20 text-center flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                  <p className="text-xs">Loading quotation history & ledger...</p>
                </div>
              ) : !historyData ? (
                <div className="py-20 text-center text-xs text-muted-foreground">
                  No history record available.
                </div>
              ) : (
                <>
                  {/* Header Summary Card */}
                  <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-black text-amber-500 block">
                          {historyData.quotation.quote_number}
                        </span>
                        <h4 className="text-sm font-bold text-foreground mt-0.5">
                          {historyData.quotation.customer_company || historyData.quotation.customer_name}
                        </h4>
                        {historyData.quotation.customer_company && (
                          <p className="text-xs text-muted-foreground">
                            Contact: {historyData.quotation.customer_name} {historyData.quotation.customer_phone && `(${historyData.quotation.customer_phone})`}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Total Quoted</span>
                        <span className="text-base font-black text-foreground">
                          {fmt(historyData.quotation.total_amount || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 text-[11px]">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Type</span>
                        <span className="font-semibold capitalize text-foreground">
                          {historyData.quotation.quote_type || 'Wholesale'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Created Date</span>
                        <span className="font-medium text-foreground">
                          {new Date(historyData.quotation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Valid Until</span>
                        <span className="font-medium text-foreground">
                          {historyData.quotation.valid_until
                            ? new Date(historyData.quotation.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Raw Status</span>
                        <span className="font-bold uppercase text-foreground">
                          {historyData.quotation.status}
                        </span>
                      </div>
                    </div>

                    {/* If Voided Metadata */}
                    {(historyData.quotation.status === 'voided' || historyData.quotation.voided_at) && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-destructive">
                          <Ban className="h-3.5 w-3.5" /> Void Information
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                          <div>
                            <span className="text-muted-foreground">Reason: </span>
                            <span className="font-bold text-foreground">
                              {historyData.quotation.void_reason?.replace(/_/g, ' ') || 'Cancelled'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Voided By: </span>
                            <span className="text-foreground">{historyData.quotation.voided_by || 'Staff'}</span>
                          </div>
                        </div>
                        {historyData.quotation.void_notes && (
                          <p className="text-[11px] text-muted-foreground pt-1 border-t border-destructive/10 mt-1">
                            <span className="font-semibold text-foreground">Notes: </span>
                            {historyData.quotation.void_notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Linked Commercial Invoice Section */}
                  {historyData.linkedInvoice ? (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-blue-400" />
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-blue-400">
                              Linked Commercial Invoice
                            </h4>
                            <p className="font-mono text-sm font-bold text-foreground">
                              #{historyData.linkedInvoice.invoiceNumber}
                            </p>
                            {historyData.linkedInvoice.issuedByName && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Issued by: <span className="font-semibold text-foreground">{historyData.linkedInvoice.issuedByName}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {historyData.linkedInvoice.isRevoked ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              REVOKED
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              historyData.linkedInvoice.paymentStatus === 'PAID'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : historyData.linkedInvoice.paymentStatus === 'BALANCE PENDING'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {historyData.linkedInvoice.paymentStatus}
                            </span>
                          )}

                          {onNavigateTab && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setHistoryQuoteId(null);
                                onNavigateTab('sales', { id: historyData.linkedInvoice.id, search: historyData.linkedInvoice.invoiceNumber });
                              }}
                              className="h-7 text-[10px] font-bold gap-1 text-blue-400 border-blue-500/30 hover:bg-blue-500/10 cursor-pointer"
                            >
                              <ExternalLink className="h-3 w-3" /> View in Sales
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Revoked Notice */}
                      {historyData.linkedInvoice.isRevoked && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded p-2.5 text-xs space-y-1">
                          <p className="font-bold text-rose-400">
                            Invoice Revoked on {new Date(historyData.linkedInvoice.invoiceRevokedAt).toLocaleDateString('en-GB')} by {historyData.linkedInvoice.invoiceRevokedBy || 'Staff'}
                          </p>
                          {historyData.linkedInvoice.invoiceRevokeReason && (
                            <p className="text-[11px] text-muted-foreground">
                              Reason: {historyData.linkedInvoice.invoiceRevokeReason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Financial breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 text-xs">
                        <div>
                          <span className="text-muted-foreground text-[10px] block">Invoice Total</span>
                          <span className="font-bold text-foreground">{fmt(historyData.linkedInvoice.total)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px] block">Effective Paid</span>
                          <span className="font-bold text-emerald-400">{fmt(historyData.linkedInvoice.effectiveClearedPaid)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px] block">Pending Cheques</span>
                          <span className="font-bold text-amber-400">{fmt(historyData.linkedInvoice.pendingClearance)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px] block">Balance Due</span>
                          <span className="font-bold text-foreground">{fmt(historyData.linkedInvoice.balanceDue)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted/20 border border-dashed border-border rounded-xl p-3 text-center text-xs text-muted-foreground">
                      No commercial invoice linked yet.
                    </div>
                  )}

                  {/* Document Details & Items Snapshot */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Quotation Snapshot Items ({Array.isArray(historyData.quotation.items) ? historyData.quotation.items.length : 0})
                    </h4>
                    <div className="bg-card border border-border rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-muted/40 border-b border-border text-[10px] uppercase font-bold text-muted-foreground">
                          <tr>
                            <th className="p-3">Item Description</th>
                            <th className="p-3 text-center">Qty</th>
                            <th className="p-3 text-right">Unit Price</th>
                            <th className="p-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {Array.isArray(historyData.quotation.items) && historyData.quotation.items.length > 0 ? (
                            historyData.quotation.items.map((it: any, idx: number) => {
                              const itemTotal = (Number(it.qty) || 1) * (Number(it.unitPrice) || 0);
                              return (
                                <tr key={idx} className="hover:bg-muted/10">
                                  <td className="p-3">
                                    <p className="font-medium text-foreground">{it.name || it.productName}</p>
                                    {it.partNumber && <p className="text-[10px] font-mono text-muted-foreground">{it.partNumber}</p>}
                                  </td>
                                  <td className="p-3 text-center font-mono font-semibold">{it.qty}</td>
                                  <td className="p-3 text-right font-mono">{fmt(Number(it.unitPrice) || 0)}</td>
                                  <td className="p-3 text-right font-mono font-bold">{fmt(itemTotal)}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="p-3 text-center text-muted-foreground">No items captured</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Authoritative Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Authoritative History Timeline
                    </h4>
                    <div className="space-y-2 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-border">
                      {historyData.timeline && historyData.timeline.length > 0 ? (
                        historyData.timeline.map((event: any) => (
                          <div key={event.id} className="relative flex items-start gap-3 pl-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border z-10 ${
                              event.badgeVariant === 'success'
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                : event.badgeVariant === 'destructive'
                                ? 'bg-destructive/20 border-destructive text-destructive'
                                : event.badgeVariant === 'warning'
                                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                : 'bg-muted border-border text-foreground'
                            }`}>
                              <div className="w-2 h-2 rounded-full bg-current" />
                            </div>
                            <div className="flex-1 bg-muted/20 border border-border rounded-lg p-3 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-foreground">{event.title}</p>
                                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                  {new Date(event.timestamp).toLocaleString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {event.actor && (
                                <p className="text-[10px] text-muted-foreground">
                                  {event.eventType === 'QUOTATION_CONVERTED' ? 'Issued by: ' : 'Recorded by: '}
                                  <span className="font-medium text-foreground">{event.actor}</span>
                                </p>
                              )}
                              {event.details && Object.keys(event.details).length > 0 && (
                                <div className="pt-1 text-[11px] text-muted-foreground/90 font-mono space-y-0.5 bg-background/50 p-2 rounded border border-border/40">
                                  {Object.entries(event.details).map(([k, v]) => (
                                    v !== undefined && v !== null && (
                                      <div key={k} className="flex justify-between">
                                        <span className="text-muted-foreground">{k}:</span>
                                        <span className="font-medium text-foreground truncate max-w-[240px]">
                                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                        </span>
                                      </div>
                                    )
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground italic pl-6">No audit events recorded yet.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
