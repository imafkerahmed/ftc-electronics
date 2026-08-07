'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  ShoppingBag,
  Building2,
  Package,
  Bike,
  CreditCard,
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  ImageIcon,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  uploadPaymentSlipAction,
  confirmPayHereReturnAction,
  verifyOrderForSlipUploadAction,
} from '@/app/actions/checkout';
import { useCartStore } from '@/store/use-cart-store';
import { BANK_DETAILS } from '@/lib/bank-details';

type PaymentMethod = 'payhere' | 'bank_transfer' | 'cash_pickup' | 'cash_delivery';

interface OrderInfo {
  orderNumber: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  customerEmail: string;
  total: number;
}

const PAYMENT_METHOD_CONFIG = {
  payhere: { icon: CreditCard, label: 'PayHere Online', color: 'text-violet-500', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/25' },
  bank_transfer: { icon: Building2, label: 'Bank Transfer', color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/25' },
  cash_pickup: { icon: Package, label: 'Cash on Pickup', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/25' },
  cash_delivery: { icon: Bike, label: 'Cash on Delivery', color: 'text-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/25' },
};

export default function OrderConfirmationPage() {
  const searchParams = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [payhereStatus, setPayhereStatus] = useState<'pending' | 'success' | 'failed' | null>(null);

  // Slip upload state
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAuthorizedForSlip, setIsAuthorizedForSlip] = useState(false);

  useEffect(() => {
    const orderNumberParam = searchParams.get('order') || searchParams.get('order_id');
    const methodParam = (searchParams.get('method') || 'bank_transfer') as PaymentMethod;

    if (!orderNumberParam) {
      setNotFound(true);
      return;
    }

    setNotFound(false);

    if (methodParam === 'payhere') {
      setPayhereStatus('pending');
      confirmPayHereReturnAction(orderNumberParam).then((res) => {
        if (res.success) {
          setPayhereStatus('success');
          useCartStore.getState().clearCart();
        } else {
          setPayhereStatus('failed');
        }
      });
    } else {
      // Clear cart only after validating that a valid order reference exists
      useCartStore.getState().clearCart();
    }

    let hasLocalSession = false;
    try {
      const raw = sessionStorage.getItem('ftc_last_order');
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored.orderNumber === orderNumberParam) {
          setOrderInfo({ ...stored, paymentMethod: methodParam });
          setIsAuthorizedForSlip(true);
          hasLocalSession = true;
        }
      }
    } catch { /* ignore */ }

    if (!hasLocalSession) {
      verifyOrderForSlipUploadAction(orderNumberParam).then((res) => {
        if (res.success && res.order) {
          setOrderInfo({
            orderNumber: res.order.orderNumber,
            orderId: res.order.orderId,
            paymentMethod: (res.order.paymentMethod || methodParam) as PaymentMethod,
            customerEmail: res.order.customerEmail,
            total: res.order.total,
          });
          setIsAuthorizedForSlip(res.isAuthorized);
        } else {
          setNotFound(true);
        }
      });
    }
  }, [searchParams]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setUploadError('Please upload an image (JPG, PNG, WEBP) or PDF file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be under 10MB.');
      return;
    }
    setUploadError(null);
    setSlipFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setSlipPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setSlipPreview(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleUpload = async () => {
    if (!slipFile || !orderInfo) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('slip', slipFile);
    formData.append('orderNumber', orderInfo.orderNumber);
    if (orderInfo.orderId) formData.append('orderId', orderInfo.orderId);
    if (orderInfo.customerEmail) formData.append('customerEmail', orderInfo.customerEmail);

    const result = await uploadPaymentSlipAction(formData);
    setUploading(false);

    if (result.success) {
      setUploadSuccess(true);
      try { sessionStorage.removeItem('ftc_last_order'); } catch { /* ignore */ }
    } else {
      setUploadError(result.error || 'Failed to upload slip. Please try again.');
    }
  };

  if (notFound) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-16 text-foreground">
        <div className="h-14 w-14 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-500 mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold">Order Reference Not Found</h1>
        <p className="text-xs text-muted-foreground leading-relaxed">
          No valid order parameter was provided in the link. Please check your account history or order confirmation email.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Link href="/account/orders">
            <Button className="bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white">
              View Your Orders
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="text-xs font-semibold">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!orderInfo) {
    return (
      <div className="max-w-xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const methodCfg = PAYMENT_METHOD_CONFIG[orderInfo.paymentMethod] || PAYMENT_METHOD_CONFIG.bank_transfer;
  const MethodIcon = methodCfg.icon;
  const isBankTransfer = orderInfo.paymentMethod === 'bank_transfer';
  const isPayHere = orderInfo.paymentMethod === 'payhere';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* PayHere Verification Status Alert */}
      {isPayHere && payhereStatus === 'failed' && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-xs leading-relaxed">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Online Payment Status Unconfirmed</span>
            <span>
              We haven&apos;t received payment confirmation from PayHere yet. If you completed payment, your status will update automatically once verified.
            </span>
          </div>
        </div>
      )}

      {/* Success Header */}
      <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4 text-foreground">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-500">
            <CheckCircle2 className="h-9 w-9" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order Placed!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isBankTransfer
              ? 'Your order is reserved. Please complete the bank transfer to confirm.'
              : isPayHere && payhereStatus !== 'success'
              ? 'Your order record was created. Awaiting payment verification.'
              : 'Your order has been confirmed and is being prepared.'}
          </p>
        </div>

        {/* Order Summary Box */}
        <div className="bg-secondary/40 border border-border rounded-lg p-4 max-w-sm mx-auto space-y-3 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Order Reference</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-foreground">{orderInfo.orderNumber}</span>
              <button onClick={() => handleCopy(orderInfo.orderNumber)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="Copy">
                {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Payment Method</span>
            <span className={`flex items-center gap-1 font-semibold ${methodCfg.color}`}>
              <MethodIcon className="h-3 w-3" />
              {methodCfg.label}
            </span>
          </div>
          {orderInfo.total > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Amount Due</span>
              <span className="font-bold text-foreground">LKR {orderInfo.total.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {orderInfo.customerEmail && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Confirmation Sent To</span>
              <span className="font-mono text-foreground truncate max-w-[160px]">{orderInfo.customerEmail}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bank Transfer Section */}
      {isBankTransfer && !uploadSuccess && (
        <div className="bg-card border border-border rounded-xl overflow-hidden text-foreground">
          {/* Bank Details */}
          <div className="p-5 border-b border-border space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold">Bank Transfer Details</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Transfer the exact amount and use your order reference number as the payment description.
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs pt-1">
              {BANK_DETAILS.map(([label, value]) => (
                <div key={label}>
                  <div className="text-muted-foreground mb-0.5">{label}</div>
                  <div className="font-bold font-mono text-foreground">{value}</div>
                </div>
              ))}
              <div>
                <div className="text-muted-foreground mb-0.5">Reference / Description</div>
                <div className="font-bold font-mono text-blue-400">{orderInfo.orderNumber}</div>
              </div>
            </div>
          </div>

          {/* Slip Upload */}
          {isAuthorizedForSlip ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Upload className="h-4 w-4" />
                <h2 className="text-sm font-bold">Upload Payment Slip</h2>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional but recommended</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Upload your bank transfer receipt so we can verify and process your order faster.
                A link to upload later was also sent to your email — so no need to worry if you close this page.
              </p>

              {!slipFile ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                    isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-border hover:border-muted-foreground/40 hover:bg-muted/20'
                  }`}
                >
                  <ImageIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-xs font-medium text-foreground">Drop your slip here, or click to browse</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Supports JPG, PNG, WEBP, PDF — max 10MB</p>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30">
                    {slipPreview ? (
                      <img src={slipPreview} alt="Payment slip preview" className="w-full max-h-64 object-contain" />
                    ) : (
                      <div className="flex items-center gap-3 p-4">
                        <div className="h-10 w-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-red-400" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">{slipFile.name}</div>
                          <div className="text-[10px] text-muted-foreground">{(slipFile.size / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => { setSlipFile(null); setSlipPreview(null); setUploadError(null); }}
                      className="absolute top-2 right-2 h-6 w-6 bg-card/80 border border-border rounded-full flex items-center justify-center hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {uploadError && (
                    <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full h-10 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm cursor-pointer transition-colors rounded-xl disabled:opacity-50"
                  >
                    {uploading ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Uploading...</span>
                    ) : (
                      <span className="flex items-center gap-2"><Upload className="h-4 w-4" />Submit Payment Slip</span>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 text-center space-y-3 bg-muted/20">
              <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
              <p className="text-xs font-bold text-foreground">Sign in to Upload Payment Slip</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                To upload a bank transfer slip for this order, please log in to the account used during purchase.
              </p>
              <Link href={`/auth?redirect=${encodeURIComponent(`/checkout/confirmation?order=${orderInfo.orderNumber}&method=bank_transfer`)}`}>
                <Button variant="outline" className="text-xs font-semibold mt-1">Log In to Account</Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Upload success */}
      {uploadSuccess && (
        <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-5 text-center space-y-2">
          <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto" />
          <p className="text-sm font-bold text-emerald-400">Payment Slip Submitted!</p>
          <p className="text-xs text-muted-foreground">
            We&apos;ve received your slip. Our team will verify the payment and confirm your order within 1 business day.
          </p>
        </div>
      )}

      {/* COD / Pickup / Online Payment Info */}
      {!isBankTransfer && (
        <div className={`${methodCfg.bgColor} ${methodCfg.borderColor} border rounded-xl p-5 text-xs space-y-2`}>
          <p className={`font-bold uppercase tracking-widest text-[10px] ${methodCfg.color}`}>What Happens Next</p>
          {isPayHere && payhereStatus !== 'success' ? (
            <>
              <p className="text-foreground font-medium">Awaiting payment verification.</p>
              <p className="text-muted-foreground">Once PayHere confirms your payment, our team will process and dispatch your order. If you were charged, your order status will update automatically after confirmation.</p>
            </>
          ) : orderInfo.paymentMethod === 'cash_pickup' ? (
            <>
              <p className="text-foreground font-medium">Our team is preparing your order.</p>
              <p className="text-muted-foreground">You will receive a call when your order is ready for collection. Please bring your order confirmation and the exact cash amount.</p>
            </>
          ) : (
            <>
              <p className="text-foreground font-medium">Your order will be dispatched for delivery.</p>
              <p className="text-muted-foreground">Our team will contact you to confirm delivery schedule and fee. Please have cash ready at delivery.</p>
            </>
          )}
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/account/orders" className="flex-1">
          <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer flex items-center justify-center gap-2 rounded-xl transition-colors">
            <ShoppingBag className="h-4 w-4" />
            View Order Status
          </Button>
        </Link>
        <Link href="/" className="flex-1">
          <Button variant="ghost" className="w-full h-11 text-muted-foreground hover:text-foreground rounded-xl cursor-pointer">
            Continue Shopping
          </Button>
        </Link>
      </div>
    </div>
  );
}
