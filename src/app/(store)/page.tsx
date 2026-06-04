import CampaignHeroBanner from "@/components/layout/campaign-hero-banner";
import BrandLogoTicker from "@/components/layout/brand-logo-ticker";

export default function StoreHomePage() {
  return (
    <div className="w-full">
      <CampaignHeroBanner />
      <BrandLogoTicker />
      {/* Additional homepage content can be added here */}
    </div>
  );
}
