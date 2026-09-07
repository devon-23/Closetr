import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getUser } from "@/lib/supabase/server";
import { isPublicAddress } from "@/lib/net/private-address";

/**
 * Fetches one remote image on the browser's behalf.
 *
 * This exists because a third-party image taints a canvas, so the cut-out
 * pipeline can never see a photo the browser fetched itself. The bytes
 * have to come through us.
 *
 * Fetching a user-supplied URL from the server is a textbook SSRF
 * primitive, so this is deliberately narrow: signed in, https only,
 * publicly-routable addresses only, image content-types only, and capped
 * in both bytes and seconds. Redirects are followed by hand so every hop
 * gets the same treatment.
 *
 * The residual hole is DNS rebinding between the check and the fetch.
 * Closing it needs an IP-pinned HTTP agent, which is more machinery than
 * a single-user wardrobe app justifies — noted here so the next person
 * doesn't mistake this for airtight.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

/** Parses a URL and clears it only if every address it resolves to is public. */
async function safeUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(host)) return isPublicAddress(host) ? url : null;

  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return null;
    // One private answer among many is all an attacker needs.
    return addresses.every((entry) => isPublicAddress(entry.address))
      ? url
      : null;
  } catch {
    return null;
  }
}

/** Reads the body, giving up the moment it exceeds `max`. */
async function readCapped(
  response: Response,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  let target = await safeUrl(body.url);
  if (!target) {
    return NextResponse.json(
      { error: "That image address isn't allowed." },
      { status: 400 },
    );
  }

  let response: Response;
  let hops = 0;

  while (true) {
    try {
      response = await fetch(target, {
        // "follow" would let the second hop land anywhere at all.
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: ALLOWED_TYPES.join(",") },
      });
    } catch {
      return NextResponse.json(
        { error: "Couldn't reach that image." },
        { status: 502 },
      );
    }

    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("location");
    if (!location || hops >= MAX_REDIRECTS) {
      return NextResponse.json(
        { error: "That image redirected too many times." },
        { status: 502 },
      );
    }

    const next = await safeUrl(new URL(location, target).toString());
    if (!next) {
      return NextResponse.json(
        { error: "That image redirected somewhere it shouldn't." },
        { status: 400 },
      );
    }

    target = next;
    hops += 1;
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `The image host said ${response.status}.` },
      { status: 502 },
    );
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: "That link isn't an image." },
      { status: 415 },
    );
  }

  // Content-Length is a claim, not a promise — the cap is enforced on the
  // bytes that actually arrive.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too big." }, { status: 413 });
  }

  const bytes = await readCapped(response, MAX_BYTES);
  if (!bytes) {
    return NextResponse.json({ error: "That image is too big." }, { status: 413 });
  }

  return new NextResponse(new Blob([bytes], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      // These bytes came off someone else's server. Make sure nothing
      // downstream is tempted to treat them as anything but an image.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
