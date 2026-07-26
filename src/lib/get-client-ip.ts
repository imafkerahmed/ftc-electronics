/**
 * Helper to extract client IP address consistently across Server Actions and API routes.
 * Prioritizes headers overwritten by trusted reverse proxies ('cf-connecting-ip', 'x-real-ip')
 * to prevent header spoofing and rate-limit evasion.
 */
export function getTrustedClientIp(headersList: { get(name: string): string | null }): string {
  const cfIp = headersList.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const realIp = headersList.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = headersList.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    const trusted = parts[parts.length - 1];
    if (trusted) return trusted;
  }

  return 'unknown';
}
