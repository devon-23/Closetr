import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Never cache — the point is to actually hit Supabase every time. */
export const dynamic = "force-dynamic";

/**
 * Keep-alive endpoint.
 *
 * Supabase pauses a free-tier project after seven days with no API
 * requests, which would take the app offline until manually resumed.
 * A scheduled GitHub Action pings this every few days.
 *
 * The query has to reach the database to count as activity — returning
 * a bare 200 from Next would keep Vercel warm and let Supabase sleep.
 * RLS means an unauthenticated caller simply sees zero rows.
 */
export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .select("id", { head: true, count: "exact" });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
}
