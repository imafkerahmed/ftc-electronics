import CampaignHeroBanner from "@/components/layout/campaign-hero-banner";
import BrandLogoTicker from "@/components/layout/brand-logo-ticker";
import CollectionSection from "@/components/product/collection-section";
import ReviewCarousel from "@/components/product/review-carousel";
import { getCollectionProducts } from "@/lib/db";

export default async function StoreHomePage() {
  // Fetch products and categories for layout rendering
  const onSaleProducts = await getCollectionProducts('on-sale');
  const newArrivalProducts = await getCollectionProducts('new-arrivals');
  const airPurifierProducts = await getCollectionProducts('air-purifiers');

  return (
    <div className="w-full">
      <CampaignHeroBanner />
      
      <BrandLogoTicker />
      
      {/* On Sale Section - Carousel layout with red subtitle badge */}
      <CollectionSection 
        title="On-Sale"
        subtitle="Limited Stocks"
        badgeBgColor="bg-[#ff0000]"
        layout="carousel"
        products={onSaleProducts}
        seeAllLink="/products?filter=on-sale"
      />

      {/* New Arrivals Section - Responsive Grid layout */}
      <CollectionSection 
        title="New Arrivals"
        layout="grid"
        products={newArrivalProducts.slice(0, 4)}
        seeAllLink="/products?sortBy=newest"
      />

      {/* Air Purifiers Section - Carousel layout */}
      <CollectionSection 
        title="Air Purifiers"
        layout="carousel"
        products={airPurifierProducts}
        seeAllLink="/products?category=air-purifiers"
      />

      {/* Client Reviews Social Proof Carousel */}
      <ReviewCarousel />
    </div>
  );
}
