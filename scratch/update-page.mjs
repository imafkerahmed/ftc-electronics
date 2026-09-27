import fs from 'fs';

const path = 'src/app/(admin)/admin/quotations/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Caches and Ref
content = content.replace(
  'const [isProductSearching, setIsProductSearching] = useState(false);',
  `const [isProductSearching, setIsProductSearching] = useState(false);

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
  };`
);

// 2. Product Search Effect
const productSearchOld = `  useEffect(() => {
    if (focusedLineItemIndex === null) {
      setActiveProductSuggestions([]);
      return;
    }
    const term = lineItems[focusedLineItemIndex]?.name?.trim();
    if (!term || term.length < 2) {
      setActiveProductSuggestions([]);
      return;
    }
    let active = true;
    const delay = setTimeout(async () => {
      setIsProductSearching(true);
      const res = await searchQuotationProductsAction(term);
      if (active) {
        if (res.success && res.data) {
          setActiveProductSuggestions(res.data);
        }
        setIsProductSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [focusedLineItemIndex, lineItems]);`;

const productSearchNew = `  useEffect(() => {
    if (focusedLineItemIndex === null) {
      setActiveProductSuggestions([]);
      return;
    }
    const term = lineItems[focusedLineItemIndex]?.name?.trim();
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
  }, [focusedLineItemIndex, lineItems]);`;
content = content.replace(productSearchOld, productSearchNew);

// 3. Dealer Search Effect
const dealerSearchOld = `  useEffect(() => {
    if (dealerSearch.trim().length < 2) {
      setDealerResults([]);
      return;
    }
    let active = true;
    const delay = setTimeout(async () => {
      setIsDealerSearching(true);
      const res = await searchQuotationDealersAction(dealerSearch);
      if (active) {
        if (res.success && res.data) setDealerResults(res.data);
        setIsDealerSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [dealerSearch]);`;

const dealerSearchNew = `  useEffect(() => {
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
  }, [dealerSearch]);`;
content = content.replace(dealerSearchOld, dealerSearchNew);

// 4. Customer Search Effect
const customerSearchOld = `  useEffect(() => {
    if (customerSearch.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    let active = true;
    const delay = setTimeout(async () => {
      setIsCustomerSearching(true);
      const res = await searchQuotationCustomersAction(customerSearch);
      if (active) {
        if (res.success && res.data) setCustomerResults(res.data);
        setIsCustomerSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [customerSearch]);`;

const customerSearchNew = `  useEffect(() => {
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
  }, [customerSearch]);`;
content = content.replace(customerSearchOld, customerSearchNew);

// 5. handleSelectDealer
const handleSelectDealerOld = `  const handleSelectDealer = (dealer: any) => {
    setSelectedDealerId(dealer.id);
    setCustName(dealer.contact_name || dealer.company_name);
    setCustCompany(dealer.company_name);
    setCustEmail(dealer.email || '');
    setCustPhone(dealer.phone || '');
    setDealerSearch('');
    setDealerResults([]);
  };`;

const handleSelectDealerNew = `  const handleSelectDealer = async (dealer: any) => {
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
  };`;
content = content.replace(handleSelectDealerOld, handleSelectDealerNew);

// 6. handleSelectCustomer
const handleSelectCustomerOld = `  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setCustName(customer.name);
    setCustCompany('');
    setCustEmail(customer.email || '');
    setCustPhone(customer.phone || '');
    setCustomerSearch('');
    setCustomerResults([]);
  };`;

const handleSelectCustomerNew = `  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setCustName(customer.name);
    setCustCompany('');
    setCustEmail(customer.email || '');
    setCustPhone(customer.phone || '');
    if (customer.address) setCustAddress(customer.address);
    setCustomerSearch('');
    setCustomerResults([]);
  };`;
content = content.replace(handleSelectCustomerOld, handleSelectCustomerNew);

// 7. Direct Type Reset
const directTypeOld = `                    onClick={() => {
                      setQuoteType('direct');
                      setSelectedDealerId('');
                    }}`;

const directTypeNew = `                    onClick={() => {
                      setQuoteType('direct');
                      setSelectedDealerId('');
                      if (!editingQuote) {
                        setGlobalDiscount(0);
                        setGlobalDiscountType('flat');
                      }
                    }}`;
content = content.replace(directTypeOld, directTypeNew);

// 8. Dealer Search UI (Loading states)
const dealerUIOld = `                    {dealerSearch.trim().length >= 2 && dealerResults.length === 0 && !isDealerSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                        No dealers found.
                      </div>
                    )}`;

const dealerUINew = `                    {dealerSearch.trim().length === 1 && (
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
                    )}`;
content = content.replace(dealerUIOld, dealerUINew);

// 9. Customer Search UI (Loading states)
const customerUIOld = `                    {customerSearch.trim().length >= 2 && customerResults.length === 0 && !isCustomerSearching && (
                      <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg p-2 text-xs text-muted-foreground shadow-lg">
                        No customers found.
                      </div>
                    )}`;

const customerUINew = `                    {customerSearch.trim().length === 1 && (
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
                    )}`;
content = content.replace(customerUIOld, customerUINew);


// 10. Product Search UI (Loading states)
// Let's find product search UI first
fs.writeFileSync(path, content);
