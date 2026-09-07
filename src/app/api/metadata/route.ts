import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import {
  CATEGORIES,
  SUBCATEGORIES,
  type Category,
} from "@/lib/categories";

/**
 * Claude vision auto-fill.
 *
 * Runs on Haiku 4.5 — an explicit cost decision, not a default. At ~1k
 * image tokens plus a short JSON reply this lands near $0.002 an item,
 * so cataloguing a hundred pieces costs about a quarter.
 *
 * The key is server-side only. The browser sends an image and gets back
 * fields; it never sees the credential.
 */

export const dynamic = "force-dynamic";

/** Slightly above the 768px JPEG the client sends, as a sanity bound. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const MODEL = "claude-haiku-4-5";

const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

const TOOL: Anthropic.Tool = {
  name: "describe_garment",
  description:
    "Record the attributes of the single clothing item shown in the photo.",
  // Guarantees the arguments validate against the schema, so the
  // normalising below is a second line of defence rather than the first.
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "brand",
      "category",
      "subcategory",
      "color",
      "colorHex",
      "tags",
    ],
    properties: {
      name: {
        type: "string",
        description:
          "Short everyday name, 2-4 words, like 'Black Nike Tee' or " +
          "'Cream Cable Sweater'. No sentences.",
      },
      brand: {
        type: ["string", "null"],
        description:
          "Brand, only if a logo or wordmark is actually legible. Null if " +
          "you are guessing.",
      },
      category: { type: "string", enum: [...CATEGORIES] },
      subcategory: {
        type: ["string", "null"],
        description:
          "Must be one of the subcategories listed for the chosen category " +
          "in the prompt. Null if none fit.",
      },
      color: {
        type: "string",
        description: "Single dominant colour as one capitalised word.",
      },
      colorHex: {
        type: "string",
        description: "That colour as a #rrggbb hex code.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "2-5 short tags covering season, occasion, or vibe. Title case.",
      },
    },
  },
};

const SYSTEM = [
  "You catalogue clothing for a personal wardrobe app.",
  "Describe only the single garment in the photo — ignore hangers, hands,",
  "backgrounds, and anything the person is also wearing.",
  "Be plain and literal. The user will correct you, so a confident wrong",
  "brand is worse than null.",
  "",
  "Valid subcategories per category:",
  ...CATEGORIES.map(
    (category) => `- ${category}: ${SUBCATEGORIES[category].join(", ")}`,
  ),
].join("\n");

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Auto-fill isn't configured. Add ANTHROPIC_API_KEY." },
      { status: 501 },
    );
  }

  let body: { imageBase64?: unknown; mediaType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const { imageBase64, mediaType } = body;

  if (typeof imageBase64 !== "string" || !imageBase64) {
    return NextResponse.json(
      { error: "imageBase64 is required." },
      { status: 400 },
    );
  }

  if (!isAllowedMediaType(mediaType)) {
    return NextResponse.json(
      { error: "Unsupported image type." },
      { status: 400 },
    );
  }

  // base64 inflates by 4/3; check the decoded size.
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [TOOL],
      // One call, one structured answer — there is no agentic loop here.
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            { type: "text", text: "Catalogue this garment." },
          ],
        },
      ],
    });

    const block = response.content.find(
      (item): item is Anthropic.ToolUseBlock => item.type === "tool_use",
    );

    if (!block) {
      return NextResponse.json(
        { error: "Claude didn't return any fields." },
        { status: 502 },
      );
    }

    return NextResponse.json(normalize(block.input));
  } catch (error) {
    // Typed first, broad last — a bad key and a rate limit need different
    // messages, and the client decides whether retrying is worth it.
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY was rejected." },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited by Anthropic. Try again in a moment." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic error ${error.status}: ${error.message}` },
        { status: 502 },
      );
    }
    throw error;
  }
}

function isAllowedMediaType(value: unknown): value is AllowedMediaType {
  return (
    typeof value === "string" &&
    (ALLOWED_MEDIA_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Coerce the model's answer into the app's own shape.
 *
 * `strict: true` already guarantees the schema, but it can't guarantee
 * that `subcategory` is one of the strings valid for the category it
 * picked — that's a cross-field rule no JSON Schema enum expresses here.
 */
function normalize(input: unknown) {
  const raw = (input ?? {}) as Record<string, unknown>;

  const category: Category = (CATEGORIES as readonly string[]).includes(
    String(raw.category),
  )
    ? (raw.category as Category)
    : "accessories";

  const subcategory =
    typeof raw.subcategory === "string" &&
    SUBCATEGORIES[category].includes(raw.subcategory)
      ? raw.subcategory
      : null;

  const colorHex =
    typeof raw.colorHex === "string" && /^#[0-9a-f]{6}$/i.test(raw.colorHex)
      ? raw.colorHex.toLowerCase()
      : null;

  return {
    name: text(raw.name) ?? "Untitled",
    brand: text(raw.brand),
    category,
    subcategory,
    color: text(raw.color),
    colorHex,
    tags: Array.isArray(raw.tags)
      ? raw.tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [],
  };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
