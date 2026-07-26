'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPasswordAction } from '@/app/actions/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const fd = new FormData();
    fd.append('email', email);

    try {
      const res = await forgotPasswordAction(fd);
      setLoading(false);

      if (res.success) {
        setMessage(res.message || 'If an account matching that email address exists, a password reset link has been sent.');
      } else {
        setError(res.error || 'An error occurred while requesting a password reset.');
      }
    } catch {
      setLoading(false);
      setError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 bg-card p-8 rounded-xl border border-border shadow-lg">
      {/* Brand/Heading */}
      <div className="text-center">
        <Link href="/" className="text-2xl font-bold tracking-wider mb-2 inline-block">
          <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">FTC</span>
          <span className="text-muted-foreground font-light"> | </span>
          <span className="text-xs uppercase text-foreground/90">Electronics</span>
        </Link>
        <h2 className="text-xl font-bold mt-4 text-foreground">Reset Password</h2>
        <p className="text-xs text-muted-foreground mt-1">Enter your email address to receive a secure password reset link.</p>
      </div>

      {message && (
        <div role="status" aria-live="polite" className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="assertive" className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form fields */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-xs text-muted-foreground mb-2">Email Address</label>
          <Input
            id="forgot-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@example.com"
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-colors mt-2"
        >
          {loading ? 'Sending link...' : 'Send Reset Link'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {/* Link back to sign in */}
      <div className="text-center text-xs text-muted-foreground border-t border-border pt-5">
        Remembered your password?{' '}
        <Link href="/" className="text-blue-500 hover:underline font-semibold">
          Sign In
        </Link>
      </div>
    </div>
  );
}
