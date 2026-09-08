import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

/**
 * Find a product photo by name, via Google Programmable Search.
 *
 * The companion to `/api/visual-search`, and the answer to its main
 * weakness. Reverse image search asks "where else does this exact photo
 * appear", which fails for anything photographed on a bed at night —
 * licensed sports merch especially. This asks "show me pictures of a
 * Philadelphia Eagles fitted hat", which is what a person would type,
 * and it works on items Vision has never heard of.
 *
 * 100 queries a day free, which at ~100 items catalogued once is a
 * ceiling this app will never reach.
 */

export const dynamic = "force-dynamic";

const ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 200;

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // The same GCP key works for both, provided Custom Search API is
  // enabled on the project — so a separate key is optional, not required.
  const key =
    process.env.GOOGLE_SEARCH_API_KEY ?? process.env.GOOGLE_VISION_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!key || !cx) {
    return NextResponse.json(
      {
        error:
          "Search by name isn't set up. Add GOOGLE_SEARCH_CX to .env.local — see .env.example.",
      },
      { status: 501 },
    );
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const query =
    typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : "";

  if (!query) {
    return NextResponse.json(
      { error: "Give it something to search for." },
      { status: 400 },
    );
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", String(MAX_RESULTS));
  url.searchParams.set("safe", "active");

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the search service." },
      { status: 502 },
    );
  }

  const payload: {
    items?: { link?: string }[];
    error?: { message?: string };
  } = await response.json().catch(() => ({}));

  if (!response.ok) {
    // A quota trip is the one failure worth naming precisely, since it
    // resets on its own and means "try tomorrow" rather than "it's broken".
    const detail = payload.error?.message ?? `HTTP ${response.status}`;
    const quota = response.status === 429 || /quota/i.test(detail);
    return NextResponse.json(
      {
        error: quota
          ? "That's today's 100 free searches used up. It resets tomorrow."
          : `Search failed: ${detail.slice(0, 160)}`,
      },
      { status: quota ? 429 : 502 },
    );
  }

  // https only — /api/fetch-image refuses anything else, so offering an
  // http result would just produce an error the user can't act on.
  const images = [
    ...new Set(
      (payload.items ?? [])
        .map((item) => item.link)
        .filter((link): link is string => Boolean(link?.startsWith("https://"))),
    ),
  ];

  return NextResponse.json({ images });
}
