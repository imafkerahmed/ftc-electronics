import bcrypt from 'bcryptjs';

/**
 * Note: This in-memory sliding window rate limiter is process-local and provides
 * lightweight brute-force throttling for this Node.js instance. It is not a distributed
 * rate limiter across multiple cluster workers.
 */
interface RateLimitEntry {
  attempts: number;
  firstAttemptTime: number;
  lockedUntil: number;
}

const RATE_LIMIT_STORE = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_MS = 2 * 60 * 1000; // 2 minutes lockout after max failed attempts

function pruneRateLimitStore(now: number): void {
  if (RATE_LIMIT_STORE.size > 1000) {
    for (const [k, v] of RATE_LIMIT_STORE.entries()) {
      if (now - v.firstAttemptTime > WINDOW_MS && v.lockedUntil <= now) {
        RATE_LIMIT_STORE.delete(k);
      }
    }
    if (RATE_LIMIT_STORE.size > 1000) {
      let count = 0;
      for (const k of RATE_LIMIT_STORE.keys()) {
        RATE_LIMIT_STORE.delete(k);
        count++;
        if (count >= 200) break;
      }
    }
  }
}

export function checkPinRateLimit(key: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = RATE_LIMIT_STORE.get(key);

  if (!entry) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if currently locked out
  if (entry.lockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  // If lockout expired, reset attempts so user gets a fresh attempt window
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    RATE_LIMIT_STORE.delete(key);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Reset window if expired
  if (now - entry.firstAttemptTime > WINDOW_MS) {
    RATE_LIMIT_STORE.delete(key);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - entry.attempts);
  return { allowed: entry.attempts < MAX_ATTEMPTS, remainingAttempts };
}

export function recordFailedPinAttempt(key: string): void {
  const now = Date.now();
  pruneRateLimitStore(now);
  const entry = RATE_LIMIT_STORE.get(key);

  if (
    !entry ||
    (now - entry.firstAttemptTime > WINDOW_MS && entry.lockedUntil <= now) ||
    (entry.lockedUntil > 0 && entry.lockedUntil <= now)
  ) {
    RATE_LIMIT_STORE.set(key, {
      attempts: 1,
      firstAttemptTime: now,
      lockedUntil: 0,
    });
    return;
  }

  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

export function resetPinRateLimit(key: string): void {
  RATE_LIMIT_STORE.delete(key);
}

/**
 * Checks if a string is a valid bcrypt hash format.
 */
export function isBcryptHash(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value.trim());
}

/**
 * Hashes a numeric or alphanumeric PIN securely using bcrypt.
 */
export async function hashPin(pin: string): Promise<string> {
  const cleanPin = pin.trim();
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(cleanPin, salt);
}

/**
 * Securely verifies an entered PIN against a stored credential.
 * Automatically detects if stored value is a modern bcrypt hash or legacy plaintext PIN.
 */
export async function verifyPinWithLegacyMigration(
  inputPin: string,
  storedPinOrHash?: string | null
): Promise<{ valid: boolean; wasLegacyPlaintext: boolean }> {
  if (!storedPinOrHash || typeof storedPinOrHash !== 'string') {
    return { valid: false, wasLegacyPlaintext: false };
  }

  const cleanInput = inputPin.trim();
  const cleanStored = storedPinOrHash.trim();

  if (isBcryptHash(cleanStored)) {
    const valid = await bcrypt.compare(cleanInput, cleanStored);
    return { valid, wasLegacyPlaintext: false };
  }

  // Legacy plaintext fallback
  const valid = cleanInput === cleanStored;
  return { valid, wasLegacyPlaintext: true };
}
