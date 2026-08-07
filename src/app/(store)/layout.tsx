import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import CartDropdown from '@/components/cart/cart-dropdown';
import WhatsAppButton from '@/components/ui/whatsapp-button';
import AnnouncementModal from '@/components/layout/announcement-modal';
import InitialLoader from '@/components/layout/initial-loader';

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground font-sans">
      {/* Initial Page Preloader with Setting Logo */}
      <InitialLoader />

      {/* Premium Background Grid & Gradients */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(120,119,198,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,119,198,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)]" />

      {/* Navigation Header */}
      <Navbar />

      {/* Announcement Popup Ad Overlay */}
      <AnnouncementModal />

      {/* Main Page Area */}
      <main className="flex-grow relative z-10">{children}</main>

      {/* Overlays / Sliders drawers */}
      <CartDropdown />

      {/* Floating WhatsApp Button */}
      <WhatsAppButton />

      {/* Global Footer */}
      <Footer />
    </div>
  );
}
