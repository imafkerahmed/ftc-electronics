import { NextResponse } from "next/server";
import { checkSupabaseHealth } from "@/lib/supabase-admin";

export const revalidate = 0;

/**
 * GET /api/health
 * Returns 200 if Supabase is reachable, 503 if not.
 * Used by the server-down page to auto-retry and redirect back home.
 */
export async function GET() {
  const healthy = await checkSupabaseHealth();
  if (healthy) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
  return NextResponse.json({ status: "degraded" }, { status: 503 });
}
