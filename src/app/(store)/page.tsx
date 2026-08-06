import CampaignHeroBanner from "@/components/layout/campaign-hero-banner";
import BrandLogoTicker from "@/components/layout/brand-logo-ticker";
import ReviewCarousel from "@/components/product/review-carousel";
import ValuePropositions from "@/components/layout/value-propositions";
import LocationMap from "@/components/layout/location-map";
import CategoryBentoGrid from "@/components/layout/category-bento-grid";
import {
  pbHomepageBlocks,
  pbBrands,
  pbCategories,
  pbSiteSettings,
  pbHeroBanners,
} from "@/lib/pb-collections";
import HomePageLoaderWrapper from "@/components/layout/home-page-loader-wrapper";
import ImageParallaxBanner from "@/components/layout/image-parallax-banner";
import LazyScrollSection from "@/components/layout/lazy-scroll-section";
import ProductCarouselBlock from "./_components/product-carousel-block";

// ISR: cache homepage for 60 seconds — huge speed win for repeat visitors.
// Use /api/revalidate to bust cache after admin content updates.
export const revalidate = 60;

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
              imageSrc: "/assets/banners/anker-banner.webp",
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

  // Pre-fetch only shared/metadata data — no product fetches here.
  // Product carousels each fetch their own data via Suspense streaming.
  const [
    allBrands,
    rawCategories,
    rawHeroBanners,
    contactSetting,
    hoursSetting,
    generalSetting,
  ] = await Promise.all([
    pbBrands.getAll().catch(() => []),
    pbCategories.getAll().catch(() => []),
    pbHeroBanners.getActive().catch(() => []),
    pbSiteSettings.get<any>("contact").catch(() => null),
    pbSiteSettings.get<any>("hours").catch(() => null),
    pbSiteSettings.get<any>("general").catch(() => null),
  ]);

  const allCategories = rawCategories.filter((c: any) => c.isActive !== false);

  const activeHeroBanners = rawHeroBanners.map((banner) => ({
    ...banner,
    imageUrl: pbHeroBanners.getImageUrl(banner, pbUrl),
  }));

  const locatorSettings = {
    address: generalSetting?.location?.address || contactSetting?.address,
    city: generalSetting?.location?.city,
    phone: generalSetting?.contactInfo?.phone || contactSetting?.phone,
    email: generalSetting?.contactInfo?.email || contactSetting?.email,
    hours: hoursSetting?.hours,
    googleMapsLink:
      generalSetting?.location?.googleMapsUrl || contactSetting?.googleMapsLink,
    whatsappLink: contactSetting?.whatsappLink,
  };

  const brandLogos = allBrands
    .filter((b: any) => b.show_in_strip === true && b.logo)
    .map((b: any) => ({
      name: b.name,
      src: `${pbUrl}/api/files/${b.collectionId}/${b.id}/${b.logo}`,
      width: 110,
      height: 44,
    }));

  return (
    <HomePageLoaderWrapper>
      <div className="w-full bg-slate-50/40 dark:bg-neutral-950 min-h-screen space-y-0 pb-0">
        {activeBlocks.map((block: any) => {
          // Resolve device visibility class
          let visibilityClass = "block";
          if (block.deviceVisibility === "desktop-only") {
            visibilityClass = "hidden md:block";
          } else if (block.deviceVisibility === "mobile-only") {
            visibilityClass = "block md:hidden";
          }

          return (
            <div key={block.id} className={visibilityClass}>
              {block.type === "hero-banner" && (
                <CampaignHeroBanner
                  config={block.config}
                  dbSlides={activeHeroBanners as any}
                />
              )}

              {/* Product carousels stream in independently via Suspense */}
              {block.type === "product-carousel" && (
                <ProductCarouselBlock
                  block={block}
                  allCategories={allCategories}
                  allBrands={allBrands}
                  pbUrl={pbUrl}
                />
              )}

              {block.type === "promo-banner" && (
                <LazyScrollSection heightClass="min-h-[220px]">
                  <ImageParallaxBanner
                    imageSrc={
                      block.config?.imageSrc ||
                      "/assets/banners/anker-banner.webp"
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
                <CategoryBentoGrid
                  categories={allCategories}
                  config={block.config}
                />
              )}

              {block.type === "reviews-carousel" && <ReviewCarousel />}

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
        })}
      </div>
    </HomePageLoaderWrapper>
  );
}
