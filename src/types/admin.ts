// PocketBase record types for the FTC Electronics admin panel.
// These types map to PocketBase collections and extend the base RecordModel.

import { Product, Category } from "./product";

// ─── Base PocketBase Record ───────────────────────────────────────────────────
export interface PBRecord {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
}

// ─── Products Collection ──────────────────────────────────────────────────────
export interface PBProduct extends PBRecord {
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPrice?: number;
  images: string[]; // PocketBase file field names
  category: string; // relation ID → categories
  brand: string; // relation ID → brands
  specs: Record<string, string>;
  rating: number;
  numReviews: number;
  countInStock: number;
  isFeatured: boolean;
  isPreOrder: boolean;
  currency: "USD" | "LKR";
  badges: string[]; // e.g. ['new-arrival', 'on-sale', 'best-seller']
  seoTitle?: string;
  seoDescription?: string;
  status: "draft" | "published";
  tags?: string[];
  bannerImage?: string;
  bannerText?: string;
  // Expanded relations (populated by PocketBase expand)
  expand?: {
    category?: PBCategory;
    brand?: PBBrand;
  };
}

// ─── Categories Collection ────────────────────────────────────────────────────
export interface PBCategory extends PBRecord {
  name: string;
  slug: string;
  image?: string; // PocketBase file field name
  description?: string;
  tagline?: string;
  parentCategory?: string; // self-relation ID
  sortOrder: number;
  productCount: number;
  expand?: {
    parentCategory?: PBCategory;
  };
}

// ─── Brands Collection ────────────────────────────────────────────────────────
export interface PBBrand extends PBRecord {
  name: string;
  slug: string;
  logo?: string; // PocketBase file field name
  bannerImage?: string;
  description?: string;
  sortOrder: number;
  show_in_strip?: boolean;
}

// ─── Reviews Collection ───────────────────────────────────────────────────────
export type ReviewStatus = "pending" | "approved" | "rejected";

export interface PBReview extends PBRecord {
  product: string; // relation ID → products
  customerName: string;
  rating: number;
  comment: string;
  isVerified: boolean;
  isFeatured: boolean;
  status: ReviewStatus;
  photo?: string;
  expand?: {
    product?: PBProduct;
  };
}

// ─── Orders Collection ────────────────────────────────────────────────────────
export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface PBOrderItem {
  productId: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  image: string;
}

export interface PBShippingAddress {
  firstName: string;
  lastName: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface PBPaymentDetails {
  method: "stripe" | "paypal" | "cod" | "koko" | "mintpay";
  paymentId?: string;
  status: PaymentStatus;
}

export interface PBOrder extends PBRecord {
  orderId: string; // Human-readable ID like "FTC-92048"
  customer: {
    userId?: string;
    email: string;
    name: string;
  };
  items: PBOrderItem[];
  shippingAddress: PBShippingAddress;
  paymentDetails: PBPaymentDetails;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: OrderStatus;
  isPaid: boolean;
  paidAt?: string;
  isDelivered: boolean;
  deliveredAt?: string;
  notes?: string;
}

// ─── Site Settings Collection ─────────────────────────────────────────────────
export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoLight?: string;
  logoDark?: string;
  favicon?: string;
  contactInfo: {
    phone: string;
    email: string;
    whatsapp: string;
    addresses: Array<{
      label: string;
      address: string;
      mapCoordinates?: { lat: number; lng: number };
    }>;
  };
  storeHours: Array<{
    day: string;
    open: string;
    close: string;
    isClosed: boolean;
  }>;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    tiktok?: string;
    youtube?: string;
    linkedin?: string;
  };
  paymentMethods: string[]; // e.g. ['VISA', 'MC', 'AMEX', 'KOKO']
  currency: "USD" | "LKR";
  taxRate: number;
  installmentProviders: Array<{
    name: string;
    displayCopy: string;
    minOrderValue: number;
    maxOrderValue: number;
  }>;
  seoDefaults: {
    titleTemplate: string; // e.g. "%s | FTC Electronics"
    metaDescription: string;
    ogImage?: string;
  };
  announcementBar?: {
    text: string;
    link?: string;
    isEnabled: boolean;
    scheduledStart?: string;
    scheduledEnd?: string;
  };
}

export interface PBSiteSetting extends PBRecord {
  key: string;
  value: SiteSettings | Record<string, unknown>;
}

// ─── Homepage Blocks Collection ───────────────────────────────────────────────
export type HomepageBlockType =
  | "hero-banner"
  | "product-carousel"
  | "promo-banner"
  | "brand-logo-strip"
  | "category-grid"
  | "reviews-carousel"
  | "text-content"
  | "store-locator";

export interface HeroBlockConfig {
  image?: string;
  videoUrl?: string;
  headline: string;
  subheadline: string;
  ctaButtons: Array<{
    text: string;
    link: string;
    variant: "primary" | "secondary";
  }>;
  overlayOpacity: number;
  backgroundColor?: string;
}

export interface ProductCarouselConfig {
  subtitle?: string;
  exploreAllLink?: string;
  sourceRule: {
    type: "manual" | "on-sale" | "newest" | "category" | "brand" | "featured";
    categoryId?: string;
    brandId?: string;
    productIds?: string[];
  };
  itemCount: number;
  cardStyle: "default" | "compact" | "featured-grid";
}

export interface PromoBannerConfig {
  image: string;
  heading: string;
  ctaLabel: string;
  ctaLink: string;
}

export interface BrandLogoStripConfig {
  logos: Array<{
    brandId?: string;
    image: string;
    name: string;
    link?: string;
  }>;
}

export interface CategoryGridConfig {
  categoryIds: string[];
  tileImages?: Record<string, string>;
  taglines?: Record<string, string>;
  overrideProductCounts?: Record<string, number>;
}

export interface ReviewsCarouselConfig {
  reviewIds?: string[];
  maxItems: number;
}

export interface TextContentConfig {
  heading: string;
  content: string; // Rich HTML content
}

export interface StoreLocatorConfig {
  locations: Array<{
    name: string;
    address: string;
    phone: string;
    email: string;
    hours: string;
    mapCoordinates: { lat: number; lng: number };
  }>;
  ctaButtons?: Array<{ text: string; link: string }>;
}

export type HomepageBlockConfig =
  | HeroBlockConfig
  | ProductCarouselConfig
  | PromoBannerConfig
  | BrandLogoStripConfig
  | CategoryGridConfig
  | ReviewsCarouselConfig
  | TextContentConfig
  | StoreLocatorConfig;

export interface PBHomepageBlock extends PBRecord {
  type: HomepageBlockType;
  title: string;
  config: HomepageBlockConfig;
  sortOrder: number;
  isEnabled: boolean;
  scheduledStart?: string;
  scheduledEnd?: string;
  deviceVisibility: "all" | "desktop-only" | "mobile-only";
}

// ─── Hero Banners Collection ────────────────────────────────────────────────
export interface PBHeroBanner extends PBRecord {
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  description: string;
  ctaText: string;
  ctaSecondary?: string;
  link: string;
  secondaryLink?: string;
  accentColor?: string;
  /** PocketBase file field — stores the filename. Build URL via /api/files/{collectionId}/{id}/{image} */
  image?: string;
  imageAlt?: string;
  sortOrder: number;
  isEnabled: boolean;
}

// ─── Promotions Collection ────────────────────────────────────────────────────
export type PromotionType = "percentage" | "flat" | "free-shipping";

export interface PBPromotion extends PBRecord {
  name: string;
  type: PromotionType;
  discountValue: number;
  applicableTo: {
    scope: "all" | "product" | "category" | "brand";
    ids?: string[];
  };
  couponCode?: string;
  usageLimit?: number;
  usageCount: number;
  minOrderValue?: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

// ─── Audit Log Collection ─────────────────────────────────────────────────────
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "publish"
  | "unpublish";

export interface PBAuditLog extends PBRecord {
  actor: string; // User email or ID
  action: AuditAction;
  collection: string; // Which collection was affected
  recordId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

// ─── Media Collection ─────────────────────────────────────────────────────────
export interface PBMedia extends PBRecord {
  file: string; // PocketBase file field
  name: string;
  tags: string[];
  usedIn: Array<{
    collection: string;
    recordId: string;
    field: string;
  }>;
  altText?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  sizeBytes?: number;
}

// ─── Admin User Roles ─────────────────────────────────────────────────────────
export type AdminRole =
  | "admin"
  | "super_admin"
  | "store_manager"
  | "content_editor"
  | "support_staff"
  | "read_only";

export interface AdminPermissions {
  products: { read: boolean; write: boolean; delete: boolean };
  categories: { read: boolean; write: boolean; delete: boolean };
  brands: { read: boolean; write: boolean; delete: boolean };
  orders: { read: boolean; write: boolean; delete: boolean };
  reviews: { read: boolean; write: boolean; delete: boolean };
  homepage: { read: boolean; write: boolean; delete: boolean };
  settings: { read: boolean; write: boolean; delete: boolean };
  users: { read: boolean; write: boolean; delete: boolean };
  promotions: { read: boolean; write: boolean; delete: boolean };
  media: { read: boolean; write: boolean; delete: boolean };
  auditLog: { read: boolean };
  systemConfig: { read: boolean; write: boolean; delete: boolean };
}

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermissions> = {
  admin: {
    products: { read: true, write: true, delete: true },
    categories: { read: true, write: true, delete: true },
    brands: { read: true, write: true, delete: true },
    orders: { read: true, write: true, delete: true },
    reviews: { read: true, write: true, delete: true },
    homepage: { read: true, write: true, delete: true },
    settings: { read: true, write: true, delete: true },
    users: { read: true, write: true, delete: true },
    promotions: { read: true, write: true, delete: true },
    media: { read: true, write: true, delete: true },
    auditLog: { read: true },
    systemConfig: { read: true, write: true, delete: true },
  },
  super_admin: {
    products: { read: true, write: true, delete: true },
    categories: { read: true, write: true, delete: true },
    brands: { read: true, write: true, delete: true },
    orders: { read: true, write: true, delete: true },
    reviews: { read: true, write: true, delete: true },
    homepage: { read: true, write: true, delete: true },
    settings: { read: true, write: true, delete: true },
    users: { read: true, write: true, delete: true },
    promotions: { read: true, write: true, delete: true },
    media: { read: true, write: true, delete: true },
    auditLog: { read: true },
    systemConfig: { read: true, write: true, delete: true },
  },
  store_manager: {
    products: { read: true, write: true, delete: true },
    categories: { read: true, write: true, delete: false },
    brands: { read: true, write: true, delete: false },
    orders: { read: true, write: true, delete: false },
    reviews: { read: true, write: true, delete: true },
    homepage: { read: true, write: true, delete: false },
    settings: { read: true, write: false, delete: false },
    users: { read: true, write: false, delete: false },
    promotions: { read: true, write: true, delete: true },
    media: { read: true, write: true, delete: true },
    auditLog: { read: true },
    systemConfig: { read: true, write: true, delete: false },
  },
  content_editor: {
    products: { read: true, write: true, delete: false },
    categories: { read: true, write: true, delete: false },
    brands: { read: true, write: false, delete: false },
    orders: { read: false, write: false, delete: false },
    reviews: { read: true, write: true, delete: false },
    homepage: { read: true, write: true, delete: false },
    settings: { read: true, write: false, delete: false },
    users: { read: false, write: false, delete: false },
    promotions: { read: true, write: false, delete: false },
    media: { read: true, write: true, delete: false },
    auditLog: { read: false },
    systemConfig: { read: true, write: false, delete: false },
  },
  support_staff: {
    products: { read: true, write: false, delete: false },
    categories: { read: true, write: false, delete: false },
    brands: { read: true, write: false, delete: false },
    orders: { read: true, write: true, delete: false },
    reviews: { read: true, write: true, delete: false },
    homepage: { read: false, write: false, delete: false },
    settings: { read: false, write: false, delete: false },
    users: { read: true, write: false, delete: false },
    promotions: { read: true, write: false, delete: false },
    media: { read: true, write: false, delete: false },
    auditLog: { read: false },
    systemConfig: { read: true, write: false, delete: false },
  },
  read_only: {
    products: { read: true, write: false, delete: false },
    categories: { read: true, write: false, delete: false },
    brands: { read: true, write: false, delete: false },
    orders: { read: true, write: false, delete: false },
    reviews: { read: true, write: false, delete: false },
    homepage: { read: true, write: false, delete: false },
    settings: { read: true, write: false, delete: false },
    users: { read: false, write: false, delete: false },
    promotions: { read: true, write: false, delete: false },
    media: { read: true, write: false, delete: false },
    auditLog: { read: true },
    systemConfig: { read: true, write: false, delete: false },
  },
};

// ─── Converters: PocketBase Record → Storefront Types ────────────────────────
// These bridge PocketBase records to the existing Product/Category interfaces
// so the storefront doesn't need to know about PocketBase internals.

/**
 * Converts a PocketBase product record to the storefront Product type.
 * Handles image URL resolution via the PocketBase file API.
 */
export function pbProductToProduct(record: PBProduct, pbUrl: string): Product {
  const imageUrls = (record.images || []).map(
    (filename) =>
      `${pbUrl}/api/files/${record.collectionId}/${record.id}/${filename}`,
  );

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    price: record.price,
    discountPrice: record.discountPrice || undefined,
    images:
      imageUrls.length > 0
        ? imageUrls
        : [
            "https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=600&auto=format&fit=crop",
          ], // generic placeholder
    category: record.expand?.category?.name || record.category,
    brand: record.expand?.brand?.name || record.brand,
    specs: record.specs || {},
    rating: record.rating || 0,
    numReviews: record.numReviews || 0,
    countInStock: record.countInStock || 0,
    isFeatured: record.isFeatured || false,
    isPreOrder: record.isPreOrder || false,
    currency: record.currency || "LKR",
    createdAt: record.created,
    badges: record.badges || [],
    status: record.status || "draft",
    bannerImage: record.bannerImage
      ? (record.bannerImage.startsWith('http://') || record.bannerImage.startsWith('https://') || record.bannerImage.startsWith('data:')
          ? record.bannerImage
          : `${pbUrl}/api/files/${record.collectionId}/${record.id}/${record.bannerImage}`)
      : undefined,
    bannerText: record.bannerText || undefined,
  };
}

/**
 * Converts a PocketBase category record to the storefront Category type.
 */
export function pbCategoryToCategory(
  record: PBCategory,
  pbUrl: string,
): Category {
  const imageUrl = record.image
    ? `${pbUrl}/api/files/${record.collectionId}/${record.id}/${record.image}`
    : undefined;

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    image: imageUrl,
    count: record.productCount || 0,
  };
}
