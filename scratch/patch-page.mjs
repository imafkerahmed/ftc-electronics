import fs from 'fs';
let code = fs.readFileSync('src/app/(admin)/admin/quotations/page.tsx', 'utf8');

// Add states for customer and dealer searches
const stateCodeToAdd = `
  const [dealerSearch, setDealerSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [dealerResults, setDealerResults] = useState<any[]>([]);
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [isDealerSearching, setIsDealerSearching] = useState(false);
  const [isCustomerSearching, setIsCustomerSearching] = useState(false);

  useEffect(() => {
    if (dealerSearch.trim().length < 2) {
      setDealerResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setIsDealerSearching(true);
      const res = await searchQuotationDealersAction(dealerSearch);
      if (res.success && res.data) setDealerResults(res.data);
      setIsDealerSearching(false);
    }, 300);
    return () => clearTimeout(delay);
  }, [dealerSearch]);

  useEffect(() => {
    if (customerSearch.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setIsCustomerSearching(true);
      const res = await searchQuotationCustomersAction(customerSearch);
      if (res.success && res.data) setCustomerResults(res.data);
      setIsCustomerSearching(false);
    }, 300);
    return () => clearTimeout(delay);
  }, [customerSearch]);
`;

code = code.replace(
  `  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number>(-1);`,
  `  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number>(-1);\n` + stateCodeToAdd
);

// Replace handleSelectDealer and handleSelectCustomer
const handlersToAdd = `
  const handleSelectDealer = (dealer: any) => {
    setSelectedDealerId(dealer.id);
    setCustName(dealer.contact_name || dealer.company_name);
    setCustCompany(dealer.company_name);
    setCustEmail(dealer.email || '');
    setCustPhone(dealer.phone || '');
    setDealerSearch('');
    setDealerResults([]);
  };

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setCustName(customer.name);
    setCustCompany('');
    setCustEmail(customer.email || '');
    setCustPhone(customer.phone || '');
    setCustomerSearch('');
    setCustomerResults([]);
  };
`;
code = code.replace(
  `  const handleOpenModal = async (quote?: Quotation) => {`,
  handlersToAdd + `\n  const handleOpenModal = async (quote?: Quotation) => {`
);

// Replace the Dealer/Customer Selectors JSX
const oldSelectors = `              {/* Existing Record Lookup / Autocomplete */}
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
                          {c.name} {c.phone ? \`(\${c.phone})\` : ''} {c.email ? \`· \${c.email}\` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>`;

const newSelectors = `              {/* Existing Record Lookup / Autocomplete */}
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
              </div>`;

code = code.replace(oldSelectors, newSelectors);

fs.writeFileSync('src/app/(admin)/admin/quotations/page.tsx', code);
