export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...productKeys.lists(), { filters }] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (idOrSlug: string) => [...productKeys.details(), idOrSlug] as const,
  searches: () => [...productKeys.all, 'search'] as const,
  search: (query: string) => [...productKeys.searches(), { query }] as const,
};

export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => [...categoryKeys.all, 'list'] as const,
  details: () => [...categoryKeys.all, 'detail'] as const,
  detail: (slug: string) => [...categoryKeys.details(), slug] as const,
};

export const brandKeys = {
  all: ['brands'] as const,
  lists: () => [...brandKeys.all, 'list'] as const,
  details: () => [...brandKeys.all, 'detail'] as const,
  detail: (slug: string) => [...brandKeys.details(), slug] as const,
};

export const adminKeys = {
  all: ['admin'] as const,
  dashboard: () => [...adminKeys.all, 'dashboard'] as const,
  products: (filters?: Record<string, any>) => [...adminKeys.all, 'products', filters || {}] as const,
  categories: () => [...adminKeys.all, 'categories'] as const,
  brands: () => [...adminKeys.all, 'brands'] as const,
  orders: (filters?: Record<string, any>) => [...adminKeys.all, 'orders', filters || {}] as const,
  customers: (filters?: Record<string, any>) => [...adminKeys.all, 'customers', filters || {}] as const,
  inventory: (filters?: Record<string, any>) => [...adminKeys.all, 'inventory', filters || {}] as const,
  quotations: (filters?: Record<string, any>) => [...adminKeys.all, 'quotations', filters || {}] as const,
};
