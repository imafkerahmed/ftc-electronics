import CampaignHeroBanner from "@/components/layout/campaign-hero-banner";
import BrandLogoTicker from "@/components/layout/brand-logo-ticker";
import CollectionSection from "@/components/product/collection-section";
import ReviewCarousel from "@/components/product/review-carousel";
import ValuePropositions from "@/components/layout/value-propositions";
import LocationMap from "@/components/layout/location-map";
import CategoryBentoGrid from "@/components/layout/category-bento-grid";
import {
  pbHomepageBlocks,
  pbBrands,
  pbCategories,
  pbProducts,
  pbSiteSettings,
  pbHeroBanners,
} from "@/lib/pb-collections";
import HomePageLoaderWrapper from "@/components/layout/home-page-loader-wrapper";
import ImageParallaxBanner from "@/components/layout/image-parallax-banner";
import LazyScrollSection from "@/components/layout/lazy-scroll-section";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StoreHomePage() {
  // Fetch active homepage blocks from the database
  const blocks = await pbHomepageBlocks.getActive();

  // If the database has no configured blocks, fall back to the default layout
  const activeBlocks =
    blocks && blocks.length > 0
      ? blocks
      : [
          {
            id: "def-hero",
            type: "hero-banner",
            title: "Hero Carousel",
            config: {},
            deviceVisibility: "all",
          },
          {
            id: "def-sale",
            type: "product-carousel",
            title: "On-Sale",
            config: { source: "on-sale", layout: "featured-grid", limit: 6 },
            deviceVisibility: "all",
          },
          {
            id: "def-promo",
            type: "promo-banner",
            title: "Office Gear",
            config: {
              imageSrc: "/assets/banners/anker-banner.png",
              alt: "Next-Gen Office Gear",
              href: "/products?search=keyboard",
              overlayText: "Next-Gen Office Gear",
              ctaLabel: "Shop Keyboards",
            },
            deviceVisibility: "all",
          },
          {
            id: "def-new",
            type: "product-carousel",
            title: "New Arrivals",
            config: { source: "newest", layout: "featured-grid", limit: 6 },
            deviceVisibility: "all",
          },
          {
            id: "def-brands",
            type: "brand-logo-strip",
            title: "Brands Strip",
            config: {},
            deviceVisibility: "all",
          },
          {
            id: "def-categories",
            type: "category-grid",
            title: "Category Grid",
            config: {},
            deviceVisibility: "all",
          },
          {
            id: "def-reviews",
            type: "reviews-carousel",
            title: "Customer Reviews",
            config: {},
            deviceVisibility: "all",
          },
          {
            id: "def-text",
            type: "text-content",
            title: "Why Choose Us",
            config: {},
            deviceVisibility: "all",
          },
          {
            id: "def-map",
            type: "store-locator",
            title: "Experience Center",
            config: {},
            deviceVisibility: "all",
          },
        ];

  const pbUrl =
    process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://ftc-db.codix.site";

  // 1. Pre-fetch shared data to optimize rendering
  const allBrands = await pbBrands.getAll().catch(() => []);
  const allCategories = await pbCategories.getAll().catch(() => []);

  // Fetch active hero banner slides from PocketBase (admin-managed)
  // Build the full image URL server-side using the PocketBase file API pattern
  const rawHeroBanners = await pbHeroBanners.getActive().catch(() => []);
  const activeHeroBanners = rawHeroBanners.map((banner) => ({
    ...banner,
    imageUrl: pbHeroBanners.getImageUrl(banner, pbUrl),
  }));

  const contactSetting = await pbSiteSettings
    .get<any>("contact")
    .catch(() => null);
  const hoursSetting = await pbSiteSettings.get<any>("hours").catch(() => null);
  const generalSetting = await pbSiteSettings.get<any>("general").catch(() => null);

  const locatorSettings = {
    address: generalSetting?.location?.address || contactSetting?.address,
    city: generalSetting?.location?.city,
    phone: generalSetting?.contactInfo?.phone || contactSetting?.phone,
    email: generalSetting?.contactInfo?.email || contactSetting?.email,
    hours: hoursSetting?.hours,
    googleMapsLink: generalSetting?.location?.googleMapsUrl || contactSetting?.googleMapsLink,
    whatsappLink: contactSetting?.whatsappLink,
  };

  const brandLogos = allBrands
    .filter((b: any) => b.show_in_strip === true && b.logo)
    .map((b: any) => ({
      name: b.name,
      src: `${pbUrl}/api/files/${b.collectionId}/${b.id}/${b.logo}`,
      width:
        b.name === "Samsung" || b.name === "Anker" || b.name === "Ugreen"
          ? 95
          : b.name === "Wiwu"
            ? 85
            : 32,
      height: 32,
    }));

  return (
    <HomePageLoaderWrapper>
      <div className="w-full bg-slate-50/40 dark:bg-neutral-950 min-h-screen space-y-0 pb-12">
        {await Promise.all(
          activeBlocks.map(async (block: any) => {
            // Resolve device visibility class
            let visibilityClass = "block";
            if (block.deviceVisibility === "desktop-only") {
              visibilityClass = "hidden md:block";
            } else if (block.deviceVisibility === "mobile-only") {
              visibilityClass = "block md:hidden";
            }

            // Fetch products dynamically for carousel
            let products: any[] = [];
            if (block.type === "product-carousel") {
              const source = block.config?.source || "newest";
              const limit = parseInt(block.config?.limit) || 8;

              try {
                if (source === "on-sale") {
                  products = await pbProducts.getByCollection("on-sale", limit);
                } else if (source === "newest") {
                  products = await pbProducts.getByCollection(
                    "new-arrivals",
                    limit,
                  );
                } else if (source === "featured") {
                  products = await pbProducts.getByCollection(
                    "featured",
                    limit,
                  );
                } else if (source === "limited-stock") {
                  const res = await pbProducts
                    .getAll({ perPage: limit * 2 })
                    .catch(() => ({ items: [] }));
                  products = (res.items || [])
                    .filter((p: any) => {
                      const qty = p.countInStock ?? p.stock ?? 0;
                      return qty > 0 && qty <= 10;
                    })
                    .slice(0, limit);
                } else if (source === "category") {
                  const categorySlug =
                    block.config?.value || block.config?.category;
                  const categoryRecord = allCategories.find(
                    (c: any) =>
                      c.slug === categorySlug ||
                      c.id === categorySlug ||
                      c.name === categorySlug,
                  );
                  if (categoryRecord) {
                    const res = await pbProducts.getAll({
                      category: categoryRecord.name,
                      perPage: limit,
                    });
                    products = res.items;
                  }
                } else if (source === "brand") {
                  const brandSlug = block.config?.value || block.config?.brand;
                  const brandRecord = allBrands.find(
                    (b: any) =>
                      b.slug === brandSlug ||
                      b.id === brandSlug ||
                      b.name === brandSlug,
                  );
                  if (brandRecord) {
                    const res = await pbProducts.getAll({
                      brand: brandRecord.name,
                      perPage: limit,
                    });
                    products = res.items;
                  }
                }

                // Global fallback if specific query returned no items
                if (!products || products.length === 0) {
                  const fallbackRes = await pbProducts
                    .getAll({ perPage: limit })
                    .catch(() => ({ items: [] }));
                  products = fallbackRes.items || [];
                }
              } catch (err) {
                console.error(
                  `Failed to load products for block ${block.title}:`,
                  err,
                );
              }
            }

            const seeAllLink =
              block.config?.seeAllLink ||
              (block.config?.source === "on-sale"
                ? "/products?filter=on-sale"
                : block.config?.source === "newest"
                  ? "/products?sortBy=newest"
                  : "/products");

            return (
              <div key={block.id} className={visibilityClass}>
                {block.type === "hero-banner" && (
                  <CampaignHeroBanner
                    config={block.config}
                    dbSlides={activeHeroBanners as any}
                  />
                )}

                {block.type === "product-carousel" && (
                  <LazyScrollSection heightClass="min-h-[500px]">
                    <CollectionSection
                      title={block.title || "Products"}
                      layout={block.config?.layout || "featured-grid"}
                      products={products}
                      seeAllLink={seeAllLink}
                      rows={block.config?.rows}
                      limit={block.config?.limit}
                    />
                  </LazyScrollSection>
                )}

                {block.type === "promo-banner" && (
                  <LazyScrollSection heightClass="min-h-[220px]">
                    <ImageParallaxBanner
                      imageSrc={
                        block.config?.imageSrc ||
                        "/assets/banners/anker-banner.png"
                      }
                      alt={block.config?.alt || "Promo Banner"}
                      href={block.config?.href || "/products"}
                      heightClass="h-[160px] sm:h-[240px] md:h-[320px]"
                      overlayText={block.config?.overlayText || ""}
                      ctaLabel={block.config?.ctaLabel || ""}
                    />
                  </LazyScrollSection>
                )}

                {block.type === "brand-logo-strip" && (
                  <LazyScrollSection heightClass="min-h-[130px]">
                    <BrandLogoTicker brandLogos={brandLogos} />
                  </LazyScrollSection>
                )}

                {block.type === "category-grid" && (
                  <CategoryBentoGrid categories={allCategories} config={block.config} />
                )}

                {block.type === "reviews-carousel" && (
                  <ReviewCarousel />
                )}

                {block.type === "text-content" && (
                  <LazyScrollSection heightClass="min-h-[300px]">
                    <ValuePropositions config={block.config} />
                  </LazyScrollSection>
                )}

                {block.type === "store-locator" && (
                  <LazyScrollSection heightClass="min-h-[400px]">
                    <LocationMap settings={locatorSettings} />
                  </LazyScrollSection>
                )}
              </div>
            );
          }),
        )}
      </div>
    </HomePageLoaderWrapper>
  );
}
