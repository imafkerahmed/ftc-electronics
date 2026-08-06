import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import OrderConfirmationContent from './confirmation-content';

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto flex items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="text-sm">Loading order confirmation...</span>
        </div>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
