'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '@/app/actions/auth';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    const fd = new FormData();
    fd.append('token', token);
    fd.append('password', password);
    fd.append('confirmPassword', confirmPassword);

    try {
      const res = await resetPasswordAction(fd);
      setLoading(false);

      if (res.success) {
        setMessage(res.message || 'Your password has been successfully reset. Redirecting to login...');
        setTimeout(() => {
          router.push('/sign-in');
        }, 2000);
      } else {
        setError(res.error || 'Invalid or expired password reset token.');
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
        <h2 className="text-xl font-bold mt-4 text-foreground">Set New Password</h2>
        <p className="text-xs text-muted-foreground mt-1">Create a new secure password for your account.</p>
      </div>

      {message && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!token ? (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs">
          Missing or invalid reset token in URL parameters. Please check your reset link or request a new reset email.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-xs text-muted-foreground mb-2">New Password</label>
            <Input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs text-muted-foreground mb-2">Confirm New Password</label>
            <Input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-colors mt-2"
          >
            {loading ? 'Updating password...' : 'Update Password'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      )}

      {/* Link back to sign in */}
      <div className="text-center text-xs text-muted-foreground border-t border-border pt-5">
        Back to{' '}
        <Link href="/sign-in" className="text-blue-500 hover:underline font-semibold">
          Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center p-8 text-xs text-muted-foreground">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
