import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import type { SearchCandidate } from "@/lib/types";

/**
 * Google Vision Web Detection — "what is this thing, online?"
 *
 * Used to attach provenance (a product page and title) to an item, and
 * to offer a clean catalogue photo in place of a phone snap. Free for
 * the first 1000 requests a month, then about $1.50 per 1000, so this is
 * only ever called when the user explicitly asks for it.
 */

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

type WebDetection = {
  webDetection?: {
    bestGuessLabels?: { label?: string }[];
    pagesWithMatchingImages?: {
      url?: string;
      pageTitle?: string;
      fullMatchingImages?: { url?: string }[];
      partialMatchingImages?: { url?: string }[];
    }[];
    visuallySimilarImages?: { url?: string }[];
  };
  error?: { message?: string };
};

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Online search isn't configured. Add GOOGLE_VISION_API_KEY." },
      { status: 501 },
    );
  }

  let body: { imageBase64?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const { imageBase64 } = body;
  if (typeof imageBase64 !== "string" || !imageBase64) {
    return NextResponse.json(
      { error: "imageBase64 is required." },
      { status: 400 },
    );
  }
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "WEB_DETECTION", maxResults: 10 }],
        },
      ],
    }),
  });

  if (!response.ok) {
    // Google puts the useful part in the body, not the status text.
    const detail = await response.text();
    return NextResponse.json(
      { error: `Vision API ${response.status}: ${detail.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const payload: { responses?: WebDetection[] } = await response.json();
  const result = payload.responses?.[0];

  if (result?.error?.message) {
    return NextResponse.json({ error: result.error.message }, { status: 502 });
  }

  const detection = result?.webDetection;

  const candidates: SearchCandidate[] = (detection?.pagesWithMatchingImages ?? [])
    .map((page) => ({
      title: (page.pageTitle ?? "").replace(/\s+/g, " ").trim(),
      url: page.url ?? "",
      imageUrl:
        page.fullMatchingImages?.[0]?.url ??
        page.partialMatchingImages?.[0]?.url ??
        null,
    }))
    .filter((candidate) => candidate.url && candidate.title)
    .slice(0, 8);

  return NextResponse.json({
    guess: detection?.bestGuessLabels?.[0]?.label ?? null,
    candidates,
  });
}
