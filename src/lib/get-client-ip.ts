/**
 * Helper to extract client IP address consistently across Server Actions and API routes.
 * Prefers trusted proxy-set headers ('x-real-ip', 'cf-connecting-ip', 'x-client-ip')
 * before parsing 'x-forwarded-for', avoiding header spoofing / rate-limit evasion.
 */
export function getTrustedClientIp(headersList: { get(name: string): string | null }): string {
  const realIp = headersList.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cfIp = headersList.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const clientIp = headersList.get('x-client-ip')?.trim();
  if (clientIp) return clientIp;

  const forwarded = headersList.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return '127.0.0.1';
}
