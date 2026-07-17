export interface ProductSpec {
  [key: string]: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPrice?: number;
  images: string[];
  category: string;
  brand: string;
  specs: ProductSpec;
  rating: number;
  numReviews: number;
  countInStock: number;
  isFeatured?: boolean;
  isPreOrder?: boolean;
  currency?: 'USD' | 'LKR';
  reviews?: Review[];
  createdAt: string;
  badges?: string[];
  status?: 'draft' | 'published';
  bannerImage?: string;
  bannerText?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image?: string;
  count?: number;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
}

export interface ProductFilterParams {
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: 'price-asc' | 'price-desc' | 'rating' | 'newest';
}
