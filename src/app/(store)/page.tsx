import CampaignHeroBanner from "@/components/layout/campaign-hero-banner";
import BrandLogoTicker from "@/components/layout/brand-logo-ticker";
import CollectionSection from "@/components/product/collection-section";
import ReviewCarousel from "@/components/product/review-carousel";
import ValuePropositions from "@/components/layout/value-propositions";
import LocationMap from "@/components/layout/location-map";
import CategoryBentoGrid from "@/components/layout/category-bento-grid";
import { getCollectionProducts } from "@/lib/db";
import HomePageLoaderWrapper from "@/components/layout/home-page-loader-wrapper";
import ImageParallaxBanner from "@/components/layout/image-parallax-banner";
import LazyScrollSection from "@/components/layout/lazy-scroll-section";

export default async function StoreHomePage() {
  // Fetch products and categories for layout rendering
  const onSaleProducts = await getCollectionProducts("on-sale");
  const newArrivalProducts = await getCollectionProducts("new-arrivals");

  return (
    <HomePageLoaderWrapper>
      <div className="w-full">
        {/* Hero banner at the top, loaded immediately */}
        <CampaignHeroBanner />

        {/* On Sale Section - Bento Grid layout (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[500px]">
          <CollectionSection
            title="On-Sale"
            layout="featured-grid"
            products={onSaleProducts.slice(0, 6)}
            seeAllLink="/products?filter=on-sale"
          />
        </LazyScrollSection>

        {/* Promo Banner 1: Workspace/Keyboards (Anker) (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[220px]">
          <ImageParallaxBanner
            imageSrc="/assets/banners/anker-banner.png"
            alt="Next-Gen Office Gear"
            href="/products?search=keyboard"
            heightClass="h-[160px] sm:h-[240px] md:h-[320px]"
            overlayText="Next-Gen Office Gear"
            ctaLabel="Shop Keyboards"
          />
        </LazyScrollSection>

        {/* New Arrivals Section - Asymmetric Bento Grid layout (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[500px]">
          <CollectionSection
            title="New Arrivals"
            layout="featured-grid"
            products={newArrivalProducts.slice(0, 6)}
            seeAllLink="/products?sortBy=newest"
          />
        </LazyScrollSection>

        {/* Brand Logo Ticker (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[130px]">
          <BrandLogoTicker />
        </LazyScrollSection>

        {/* Category Bento Grid Section (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[450px]">
          <CategoryBentoGrid />
        </LazyScrollSection>

        {/* Client Reviews Social Proof Carousel (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[350px]">
          <ReviewCarousel />
        </LazyScrollSection>

        {/* Why Choose Us - Bento Grid Section (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[300px]">
          <ValuePropositions />
        </LazyScrollSection>

        {/* Flagship Store Location Map (Lazy loaded on scroll) */}
        <LazyScrollSection heightClass="min-h-[400px]">
          <LocationMap />
        </LazyScrollSection>
      </div>
    </HomePageLoaderWrapper>
  );
}
