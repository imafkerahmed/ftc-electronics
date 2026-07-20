/**
 * pos-session.ts
 * Client-side POS employee session helpers (sessionStorage-based).
 * Intentionally NOT Next.js auth — this is a simple cashier lock screen.
 */

import type { PosEmployeeSession } from '@/types/pos';

const SESSION_KEY = 'pos_employee';

export function getPosSession(): PosEmployeeSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosEmployeeSession;
  } catch {
    return null;
  }
}

export function setPosSession(session: PosEmployeeSession): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearPosSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}

/** Returns true when the session exists and is less than 8 hours old. */
export function isPosSessionValid(session: PosEmployeeSession | null): boolean {
  if (!session) return false;
  const loginTime = new Date(session.loginTime).getTime();
  const eightHours = 8 * 60 * 60 * 1000;
  return Date.now() - loginTime < eightHours;
}
