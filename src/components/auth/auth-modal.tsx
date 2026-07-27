'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StoreLogoHeader } from '@/components/ui/store-logo-header';
import { loginAction, signUpAction, setOAuthSessionAction, verifyOtpAction } from '@/app/actions/auth';
import { pb } from '@/lib/pocketbase';
import { ClientResponseError } from 'pocketbase';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  onSuccessRedirect?: string;
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = 'signin',
  onSuccessRedirect,
}: AuthModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup' | 'signup_otp'>(initialMode);
  
  // Signup OTP state
  const [otpId, setOtpId] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);
  
  // Password peek states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isMountedRef = useRef(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);

  // Track component mounted status to prevent memory leak updates
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Track previously active element for focus restoration on close
  useEffect(() => {
    if (isOpen) {
      activeElementRef.current = document.activeElement as HTMLElement;
    } else {
      if (activeElementRef.current && document.contains(activeElementRef.current)) {
        activeElementRef.current.focus();
      }
      activeElementRef.current = null;
    }
  }, [isOpen]);

  // Focus trap / cycling tab behavior inside modal
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Find all focusable elements inside the modal — excluding disabled controls and
    // tabIndex={-1} elements (e.g. password-peek buttons) so trap boundaries are correct.
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = (
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
    ).filter((el) => el.tabIndex !== -1);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) {
      firstElement.focus();
    }

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstElement || !focusableElements.includes(activeEl as HTMLElement)) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (activeEl === lastElement || !focusableElements.includes(activeEl as HTMLElement)) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    panel.addEventListener('keydown', handleTabKey);
    return () => {
      panel.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen, mode, loading, sendingOtp]);

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setFormData({ name: '', email: '', password: '', confirmPassword: '' });
      setOtpId('');
      setOtpCode('');
      setSendingOtp(false);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setError(null);
      setMessage(null);
      setLoading(false);
      setGoogleLoading(false);
    }
  }, [isOpen, initialMode]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading && !sendingOtp) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, loading, sendingOtp]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);
    try {
      const authData = await pb.collection('users').authWithOAuth2({ provider: 'google' });
      if (authData?.token) {
        const res = await setOAuthSessionAction(authData.token);
        if (!isMountedRef.current) return;
        if (res.success) {
          window.dispatchEvent(new Event('auth-change'));
          onClose();
          startTransition(() => {
            router.refresh();
            if (onSuccessRedirect) {
              router.push(onSuccessRedirect);
            }
          });
          return;
        } else {
          setError(res.error || 'Failed to authorize Google session.');
        }
      } else {
        setError('Google authentication did not complete.');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const isCancelled = err instanceof ClientResponseError && (err.isAbort || err.status === 0);
      if (!isCancelled) {
        setError(
          err instanceof Error ? err.message : 'Google authentication failed. Please try again.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setGoogleLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const fd = new FormData();
    fd.append('name', formData.name);
    fd.append('email', formData.email);
    fd.append('password', formData.password);
    fd.append('confirmPassword', formData.confirmPassword);

    if (mode === 'signin') {
      setLoading(true);
      try {
        const res = await loginAction(fd);
        if (!isMountedRef.current) return;
        setLoading(false);
        if (res.success) {
          window.dispatchEvent(new Event('auth-change'));
          onClose();
          startTransition(() => {
            router.refresh();
            if (onSuccessRedirect) {
              router.push(onSuccessRedirect);
            }
          });
        } else {
          setError(res.error || 'Invalid email or password.');
        }
      } catch {
        if (isMountedRef.current) {
          setLoading(false);
          setError('An unexpected error occurred. Please try again.');
        }
      }
    } else {
      // Client-side quick input validation
      if (!formData.name.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!formData.email.trim() || !formData.email.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      // Directly transition to OTP verification screen with loader immediately
      setMode('signup_otp');
      setSendingOtp(true);
      setMessage('Sending verification code to your email...');

      // Dispatch sign up request in the background
      signUpAction(fd)
        .then((res) => {
          if (!isMountedRef.current) return;
          setSendingOtp(false);
          if (res.success && res.requiresOtp && res.otpId) {
            setOtpId(res.otpId);
            setMessage(res.message || 'Verification code sent to your email.');
          } else if (res.success) {
            setMessage(res.message || 'Account successfully created!');
            setMode('signin');
          } else {
            // Revert on error
            setMode('signup');
            setError(res.error || 'An error occurred during registration.');
            setMessage(null);
          }
        })
        .catch(() => {
          if (!isMountedRef.current) return;
          setSendingOtp(false);
          setMode('signup');
          setError('An unexpected error occurred. Please try again.');
          setMessage(null);
        });
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || sendingOtp) return;
    setError(null);
    setMessage('Resending verification code to your email...');
    setSendingOtp(true);
    setResendCooldown(60);

    const fd = new FormData();
    fd.append('name', formData.name);
    fd.append('email', formData.email);
    fd.append('password', formData.password);
    fd.append('confirmPassword', formData.confirmPassword);

    try {
      const res = await signUpAction(fd);
      if (!isMountedRef.current) return;
      setSendingOtp(false);
      if (res.success && res.requiresOtp && res.otpId) {
        setOtpId(res.otpId);
        setOtpCode('');
        setMessage(res.message || 'New verification code sent to your email.');
      } else {
        setError(res.error || 'Failed to resend code. Please try again.');
        setMessage(null);
      }
    } catch {
      if (!isMountedRef.current) return;
      setSendingOtp(false);
      setError('An unexpected error occurred. Please try again.');
      setMessage(null);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await verifyOtpAction(otpId, otpCode);
      if (!isMountedRef.current) return;
      setLoading(false);
      if (res.success) {
        window.dispatchEvent(new Event('auth-change'));
        onClose();
        startTransition(() => {
          router.refresh();
          if (onSuccessRedirect) {
            router.push(onSuccessRedirect);
          }
        });
      } else {
        setError(res.error || 'Verification failed. Please check the code and try again.');
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setLoading(false);
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred during verification.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => {
        // Prevent closing modal if loading or sending OTP code
        if (!loading && !sendingOtp) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        ref={panelRef}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative p-6 sm:p-8 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - hide only if loading or sending code */}
        {!loading && !sendingOtp && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close Auth Modal"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Store Logo & Heading */}
        <div className="text-center mb-6">
          <StoreLogoHeader noLink className="mb-2" />
          <h3 id="auth-modal-title" className="text-lg font-bold text-foreground mt-3">
            {mode === 'signup_otp'
              ? 'Verify Your Email'
              : mode === 'signin'
              ? 'Welcome Back'
              : 'Create Account'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mode === 'signup_otp'
              ? sendingOtp
                ? 'Preparing your verification details...'
                : `We have sent a 6-digit OTP code to ${formData.email}.`
              : mode === 'signin'
              ? 'Sign in to access your profile, orders, and checkout.'
              : 'Join FTC Electronics for faster checkout and order tracking.'}
          </p>
        </div>

        {/* Tab Switcher - Hide in OTP mode */}
        {mode !== 'signup_otp' && (
          <div className="grid grid-cols-2 bg-muted/60 p-1 rounded-xl mb-5 border border-border">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setMessage(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setMessage(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Alert Banners */}
        {message && (
          <div role="status" className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-2">
            {sendingOtp ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google OAuth Button - Hide in OTP mode */}
        {mode !== 'signup_otp' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full h-10 border-border bg-background hover:bg-muted text-foreground text-xs font-medium rounded-lg flex items-center justify-center gap-2.5 transition-colors cursor-pointer mb-4"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </Button>

            <div className="relative flex items-center justify-center mb-4">
              <div className="border-t border-border w-full"></div>
              <span className="bg-card px-2.5 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0 font-semibold">
                or use email
              </span>
              <div className="border-t border-border w-full"></div>
            </div>
          </>
        )}

        {/* OTP Verification Form */}
        {mode === 'signup_otp' ? (
          <form onSubmit={handleVerifyOtp} className="space-y-6 flex flex-col items-center">
            <div className="space-y-2 text-center flex flex-col items-center">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                <KeyRound className="h-3.5 w-3.5 text-blue-500" />
                Verification Code
              </label>
              
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={(val) => setOtpCode(val)}
                className="gap-2"
                disabled={sendingOtp}
                aria-label="One-Time Password Verification Code"
                autoComplete="one-time-code"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="w-full space-y-3">
              <Button
                type="submit"
                disabled={loading || sendingOtp || otpCode.length !== 6}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-colors text-xs"
              >
                {loading ? 'Verifying...' : 'Verify and Log In'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>

              {!loading && !sendingOtp && (
                <div className="flex flex-col gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0}
                    className="w-full text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0
                      ? `Resend code in ${resendCooldown}s`
                      : "Didn't receive the email? Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setOtpCode('');
                      setError(null);
                      setMessage(null);
                    }}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer"
                  >
                    Incorrect email? Go back and sign up again.
                  </button>
                </div>
              )}
            </div>
          </form>
        ) : (
          /* Email & Password Sign In / Sign Up Form */
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label htmlFor="modal-name" className="block text-[11px] font-medium text-muted-foreground mb-1">Full Name</label>
                <Input
                  id="modal-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Alex Johnson"
                  className="h-9 bg-background border-border text-foreground text-xs focus-visible:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label htmlFor="modal-email" className="block text-[11px] font-medium text-muted-foreground mb-1">Email Address</label>
              <Input
                id="modal-email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                placeholder="alex@example.com"
                className="h-9 bg-background border-border text-foreground text-xs focus-visible:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="modal-password" className="block text-[11px] font-medium text-muted-foreground mb-1">Password</label>
              <div className="relative">
                <Input
                  id="modal-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="h-9 bg-background border-border text-foreground text-xs pr-10 focus-visible:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none p-0.5 rounded"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="modal-confirm-password" className="block text-[11px] font-medium text-muted-foreground mb-1">Confirm Password</label>
                <div className="relative">
                  <Input
                    id="modal-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="••••••••"
                    className="h-9 bg-background border-border text-foreground text-xs pr-10 focus-visible:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none p-0.5 rounded"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-colors mt-4 text-xs"
            >
              {loading
                ? mode === 'signin' ? 'Signing in...' : 'Registering...'
                : mode === 'signin' ? 'Sign In' : 'Sign-Up'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
