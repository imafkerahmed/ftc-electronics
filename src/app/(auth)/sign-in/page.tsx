'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginAction } from '@/app/actions/auth';

export default function SignInPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData();
    fd.append('email', formData.email);
    fd.append('password', formData.password);

    try {
      const res = await loginAction(fd);
      setLoading(false);

      if (res.success) {
        if (res.role && ['super_admin', 'store_manager', 'content_editor', 'support_staff', 'read_only'].includes(res.role)) {
          router.push('/admin/dashboard');
        } else {
          router.push('/');
        }
      } else {
        setError(res.error || 'Invalid email or password.');
      }
    } catch {
      setLoading(false);
      setError('An error occurred during sign in. Please try again.');
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
        <h2 className="text-xl font-bold mt-4 text-foreground">Welcome Back</h2>
        <p className="text-xs text-muted-foreground mt-1">Sign in to manage your orders and profile.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form fields */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="block text-xs text-muted-foreground mb-2">Email Address</label>
          <Input
            id="signin-email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
            placeholder="alex@example.com"
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="signin-password" className="block text-xs text-muted-foreground">Password</label>
            <Link href="/forgot-password" className="text-xs text-blue-500 hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="signin-password"
            type="password"
            required
            value={formData.password}
            onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
            placeholder="••••••••"
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-colors mt-2"
        >
          {loading ? 'Authenticating...' : 'Sign In'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {/* Link back to register */}
      <div className="text-center text-xs text-muted-foreground border-t border-border pt-5">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="text-blue-500 hover:underline font-semibold">
          Create Account
        </Link>
      </div>
    </div>
  );
}

