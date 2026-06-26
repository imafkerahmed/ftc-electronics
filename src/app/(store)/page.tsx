import Link from "next/link";
import Image from "next/image";
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

export default async function StoreHomePage() {
  // Fetch products and categories for layout rendering
  const onSaleProducts = await getCollectionProducts("on-sale");
  const newArrivalProducts = await getCollectionProducts("new-arrivals");

  return (
    <HomePageLoaderWrapper>
      <div className="w-full">
        <CampaignHeroBanner />

        {/* On Sale Section - Bento Grid layout */}
        <CollectionSection
          title="On-Sale"
          layout="featured-grid"
          products={onSaleProducts.slice(0, 6)}
          seeAllLink="/products?filter=on-sale"
        />

        {/* Promo Banner 1: Workspace/Keyboards (Anker) */}
        <ImageParallaxBanner
          imageSrc="/assets/banners/anker-banner.png"
          alt="Next-Gen Office Gear"
          href="/products?search=keyboard"
          heightClass="h-[150px] sm:h-[220px] md:h-[290px]"
        />

        {/* New Arrivals Section - Asymmetric Bento Grid layout */}
        <CollectionSection
          title="New Arrivals"
          layout="featured-grid"
          products={newArrivalProducts.slice(0, 6)}
          seeAllLink="/products?sortBy=newest"
        />

        {/* Brand Logo Ticker (Placed below New Arrivals for all screens) */}
        <BrandLogoTicker />

        {/* Category Bento Grid Section */}
        <CategoryBentoGrid />

        {/* Client Reviews Social Proof Carousel */}
        <ReviewCarousel />

        {/* Why Choose Us - Bento Grid Section */}
        <ValuePropositions />

        {/* Flagship Store Location Map */}
        <LocationMap />
      </div>
    </HomePageLoaderWrapper>
  );
}
