'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SignUpPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate database registration delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    setLoading(false);
    
    // Redirect to home page after success
    router.push('/');
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
        <h2 className="text-xl font-bold mt-4 text-foreground">Create Account</h2>
        <p className="text-xs text-muted-foreground mt-1">Get started with a new account today.</p>
      </div>

      {/* Form fields */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className="block text-xs text-muted-foreground mb-2">Full Name</label>
          <Input
            id="signup-name"
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
            placeholder="John Doe"
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-xs text-muted-foreground mb-2">Email Address</label>
          <Input
            id="signup-email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
            placeholder="john@example.com"
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-xs text-muted-foreground mb-2">Password</label>
          <Input
            id="signup-password"
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
          {loading ? 'Registering account...' : 'Create Account'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {/* Link back to login */}
      <div className="text-center text-xs text-muted-foreground border-t border-border pt-5">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-blue-650 hover:underline font-semibold">
          Login
        </Link>
      </div>
    </div>
  );
}
