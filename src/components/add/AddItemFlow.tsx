"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { BevelButton } from "@/components/ui/BevelButton";
import {
  ItemFields,
  EMPTY_ITEM_FORM,
  formToPatch,
  type ItemFormValue,
} from "@/components/closet/ItemFields";
import { createItem } from "@/app/closet/actions";
import { createClient } from "@/lib/supabase/client";
import { ingestPhoto } from "@/lib/images/ingest";
import { autofillFields } from "@/lib/add/autofill";
import { blobToBase64 } from "@/lib/images/process";
import type { SearchCandidate, Tag } from "@/lib/types";

const AI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_METADATA === "true";
const SEARCH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ONLINE_SEARCH === "true";

const BUCKET = "closet";

type Stage = "pick" | "working" | "review";

type Source = { url: string; title: string } | null;

/** Tappable thumbnails of photos found online, from either search. */
function PhotoGrid({
  urls,
  onPick,
  disabled,
}: {
  urls: string[];
  onPick: (url: string) => void;
  disabled: boolean;
}) {
  return (
    <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {urls.map((url) => (
        <li key={url}>
          <button
            type="button"
            onClick={() => onPick(url)}
            disabled={disabled}
            title="Use this photo"
            className="bevel aspect-square w-full overflow-hidden bg-[var(--color-paper)] p-0.5 disabled:opacity-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="A photo found online that may match this item"
              loading="lazy"
              onError={(event) => {
                // Plenty of hosts block hotlinking. A broken icon is worse
                // than a gap.
                event.currentTarget.style.visibility = "hidden";
              }}
              className="h-full w-full object-contain"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Vision hands back lowercase labels; the name field wants a name. */
function titleCase(text: string): string {
  return text.replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Bare domain, for showing where a match came from. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function AddItemFlow({ allTags }: { allTags: Tag[] }) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("pick");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [original, setOriginal] = useState<Blob | null>(null);
  const [processed, setProcessed] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [value, setValue] = useState<ItemFormValue>(EMPTY_ITEM_FORM);
  const [source, setSource] = useState<Source>(null);

  const [candidates, setCandidates] = useState<SearchCandidate[] | null>(null);
  /** Product shots with no page attached — often all a hard item turns up. */
  const [similarImages, setSimilarImages] = useState<string[]>([]);
  /** Vision's own words for what this is, e.g. "philadelphia eagles hat". */
  const [guess, setGuess] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  /** Null until edited, so the box tracks the item name until it doesn't. */
  const [nameQuery, setNameQuery] = useState<string | null>(null);
  const [nameImages, setNameImages] = useState<string[] | null>(null);
  const [nameSearching, setNameSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Non-null while a found photo is being swapped in; holds the status line. */
  const [applying, setApplying] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setStage("working");
    setError(null);
    setNotice(null);
    setProgress(0);

    try {
      const photo = await ingestPhoto(file, {
        onStatus: setStatus,
        onProgress: setProgress,
      });

      setOriginal(photo.original);
      setProcessed(photo.processed);
      setPreview(URL.createObjectURL(photo.processed));

      const { swatch } = photo;

      if (AI_ENABLED) {
        setStatus("asking Claude what this is...");
        const filled = await autofillFields(photo.visionBase64, swatch);
        setValue(filled.value);
        // The cut-out problem is the more useful one to surface.
        setNotice(photo.notice ?? filled.notice);
      } else {
        if (swatch) setValue((prev) => ({ ...prev, colorHex: swatch }));
        setNotice(photo.notice);
      }

      setStage("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something broke.");
      setStage("pick");
    }
  }

  async function findOnline() {
    if (!original) return;
    setSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/visual-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The full 1600px original, not the 768px copy Claude gets. Web
        // detection is matching against real photos rather than reading a
        // garment, and it's priced per image, so there's nothing to save
        // by sending it less to work with.
        body: JSON.stringify({ imageBase64: await blobToBase64(original) }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Search failed.");
        setCandidates([]);
        setSimilarImages([]);
        return;
      }
      setCandidates(payload.candidates ?? []);
      setSimilarImages(payload.similarImages ?? []);
      setGuess(payload.guess ?? null);
    } catch {
      setError("Couldn't reach the search service.");
      setCandidates([]);
      setSimilarImages([]);
    } finally {
      setSearching(false);
    }
  }

  /**
   * Search by name rather than by photo.
   *
   * Reverse image search only finds an item whose exact photo is already
   * on the web. This finds the item itself, which is what works for
   * anything mass-produced but photographed badly.
   */
  async function findByName(query: string) {
    setNameSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/product-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Search failed.");
        setNameImages([]);
        return;
      }
      setNameImages(payload.images ?? []);
    } catch {
      setError("Couldn't reach the search service.");
      setNameImages([]);
    } finally {
      setNameSearching(false);
    }
  }

  /**
   * Swap in a photo found online.
   *
   * The fetched image goes through the same pipeline as a camera shot, so
   * a swapped item is framed and cut out exactly like every other one.
   * Their own photo stays as the archived original — this replaces what
   * the closet displays, not what they actually own.
   *
   * `provenance` is null for a bare image, which is the common case for
   * anything Vision recognised without finding a page to name.
   */
  async function applyPhoto(imageUrl: string, provenance: Source) {
    setApplying("fetching that photo...");
    setError(null);

    try {
      const response = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      });

      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({}));
        throw new Error(message ?? "Couldn't use that photo.");
      }

      const blob = await response.blob();
      const photo = await ingestPhoto(
        new File([blob], "found-online", { type: blob.type }),
        { onStatus: setApplying },
      );

      if (preview) URL.revokeObjectURL(preview);
      setProcessed(photo.processed);
      setPreview(URL.createObjectURL(photo.processed));
      if (provenance) setSource(provenance);
      setNotice(
        photo.notice ??
          "using the photo found online — your own is still saved as the original.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn't use that photo.",
      );
    } finally {
      setApplying(null);
    }
  }

  async function save() {
    if (!processed) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Sign in again.");
      setSaving(false);
      return;
    }

    const folder = `${user.id}/${crypto.randomUUID()}`;
    const originalPath = `${folder}/original.jpg`;
    const processedPath = `${folder}/processed.png`;
    const uploaded: string[] = [];

    try {
      if (original) {
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(originalPath, original, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(uploadError.message);
        uploaded.push(originalPath);
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(processedPath, processed, { contentType: "image/png" });
      if (uploadError) throw new Error(uploadError.message);
      uploaded.push(processedPath);

      const result = await createItem({
        ...formToPatch(value),
        originalImagePath: original ? originalPath : null,
        processedImagePath: processedPath,
        sourceUrl: source?.url ?? null,
        sourceTitle: source?.title ?? null,
      });

      if (!result.ok) throw new Error(result.error);

      router.push("/closet");
    } catch (caught) {
      // Don't leave images behind for a row that was never created.
      if (uploaded.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploaded);
      }
      setError(caught instanceof Error ? caught.message : "Couldn't save.");
      setSaving(false);
    }
  }

  /* ---------- render ---------------------------------------- */

  if (stage === "working") {
    return (
      <Panel title="Working on it">
        <div className="py-8 text-center">
          <p className="display text-xs text-[var(--color-accent)]">
            <span className="twinkle">★</span> {status}
          </p>
          {progress > 0 && progress < 1 && (
            <p className="microcopy mt-2">{Math.round(progress * 100)}%</p>
          )}
          <p className="microcopy mt-4">
            this happens on your own device, so it can take a moment.
          </p>
        </div>
      </Panel>
    );
  }

  if (stage === "review") {
    return (
      <div className="space-y-4">
        <Panel title="Does this look right?">
          <div className="flex aspect-4/3 items-center justify-center border border-[var(--color-line-soft)] bg-[var(--color-paper-alt)] p-4">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="The item you're adding"
                className="h-full w-full object-contain"
              />
            )}
          </div>

          {notice && <p className="microcopy mt-2 text-center">{notice}</p>}

          <div className="mt-3">
            <ItemFields value={value} onChange={setValue} allTags={allTags} />
          </div>
        </Panel>

        {SEARCH_ENABLED && (
          <Panel title="Where's it from? (optional)">
            {source && (
              <div className="mb-3 flex items-center justify-between gap-2 border border-[var(--color-line-soft)] bg-[var(--color-paper-alt)] p-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px]">{source.title}</p>
                  <p className="microcopy truncate">{hostOf(source.url)}</p>
                </div>
                <BevelButton
                  onClick={() => setSource(null)}
                  disabled={Boolean(applying)}
                >
                  Clear
                </BevelButton>
              </div>
            )}

            <BevelButton
              onClick={findOnline}
              disabled={searching || Boolean(applying)}
            >
              {searching
                ? "Looking..."
                : candidates
                  ? "🔎 Search again"
                  : "🔎 Find this online"}
            </BevelButton>

            {guess && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="microcopy min-w-0 truncate">
                  best guess:{" "}
                  <span className="text-[var(--color-ink)]">{guess}</span>
                </p>
                <BevelButton
                  onClick={() =>
                    setValue((prev) => ({ ...prev, name: titleCase(guess) }))
                  }
                  disabled={Boolean(applying)}
                  className="shrink-0 text-[10px]"
                >
                  Use as name
                </BevelButton>
              </div>
            )}

            {applying && (
              <p className="microcopy mt-2 text-center">
                <span className="twinkle">★</span> {applying}
              </p>
            )}

            {candidates?.length === 0 && similarImages.length === 0 && (
              <p className="microcopy mt-2">
                nothing found. this searches Google Vision&apos;s web index,
                which is a good deal smaller than Google Images — it misses
                plenty, especially licensed merch.
              </p>
            )}

            {candidates && candidates.length > 0 && (
                  <ul className="mt-2 divide-y divide-[var(--color-line-soft)]">
                    {candidates.map((candidate) => (
                      <li
                        key={candidate.url}
                        className="flex items-center gap-2 py-2"
                      >
                        {candidate.imageUrl ? (
                          // Shown straight from the source. It's only a
                          // preview — nothing touches a canvas until the
                          // user picks it, which is what needs the proxy.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={candidate.imageUrl}
                            alt=""
                            loading="lazy"
                            onError={(event) => {
                              // Plenty of shops block hotlinking. A broken
                              // icon is worse than no thumbnail.
                              event.currentTarget.style.visibility = "hidden";
                            }}
                            className="h-12 w-12 shrink-0 border border-[var(--color-line-soft)] bg-[var(--color-paper)] object-contain"
                          />
                        ) : (
                          <div className="h-12 w-12 shrink-0 border border-[var(--color-line-soft)] bg-[var(--color-paper-alt)]" />
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px]">
                            {candidate.title}
                          </p>
                          <p className="microcopy truncate">
                            {hostOf(candidate.url)}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1">
                          <BevelButton
                            onClick={() =>
                              setSource({
                                url: candidate.url,
                                title: candidate.title,
                              })
                            }
                            disabled={Boolean(applying)}
                            className="text-[10px]"
                          >
                            Link only
                          </BevelButton>
                          {candidate.imageUrl && (
                            <BevelButton
                              variant="primary"
                              onClick={() =>
                                applyPhoto(candidate.imageUrl!, {
                                  url: candidate.url,
                                  title: candidate.title,
                                })
                              }
                              disabled={Boolean(applying)}
                              className="text-[10px]"
                            >
                              Link + photo
                            </BevelButton>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
            )}

            {similarImages.length > 0 && (
              <div className="mt-3 border-t border-[var(--color-line-soft)] pt-2">
                <p className="microcopy mb-1.5">
                  just want a better picture? these look like your item but
                  came without a page to link to — tap one to use it.
                </p>
                <PhotoGrid
                  urls={similarImages}
                  onPick={(url) => applyPhoto(url, null)}
                  disabled={Boolean(applying)}
                />
              </div>
            )}

            <div className="mt-3 border-t border-[var(--color-line-soft)] pt-2">
              <p className="microcopy mb-1.5">
                or look it up by name — this finds the item rather than your
                photo of it, which is what works for anything mass-produced.
              </p>

              <div className="flex gap-1">
                <input
                  value={nameQuery ?? value.name}
                  onChange={(event) => setNameQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const query = (nameQuery ?? value.name).trim();
                    if (query) findByName(query);
                  }}
                  placeholder="philadelphia eagles fitted hat"
                  aria-label="Search the web by name"
                  className="field"
                />
                <BevelButton
                  onClick={() => {
                    const query = (nameQuery ?? value.name).trim();
                    if (query) findByName(query);
                  }}
                  disabled={
                    nameSearching ||
                    Boolean(applying) ||
                    !(nameQuery ?? value.name).trim()
                  }
                >
                  {nameSearching ? "..." : "Go"}
                </BevelButton>
              </div>

              {nameImages?.length === 0 && (
                <p className="microcopy mt-1.5">nothing came back for that.</p>
              )}

              {nameImages && nameImages.length > 0 && (
                <div className="mt-2">
                  <PhotoGrid
                    urls={nameImages}
                    onPick={(url) => applyPhoto(url, null)}
                    disabled={Boolean(applying)}
                  />
                </div>
              )}
            </div>
          </Panel>
        )}

        {error && (
          <p role="alert" className="microcopy text-center text-[var(--color-accent)]">
            {error}
          </p>
        )}

        <div className="flex justify-between gap-2">
          <BevelButton
            onClick={() => {
              setStage("pick");
              setCandidates(null);
              setSource(null);
              setValue(EMPTY_ITEM_FORM);
            }}
            disabled={saving}
          >
            Start over
          </BevelButton>
          <BevelButton
            variant="primary"
            onClick={save}
            disabled={saving || !value.name.trim()}
          >
            {saving ? "Saving..." : "✨ Add to closet ✨"}
          </BevelButton>
        </div>
      </div>
    );
  }

  return (
    <Panel title="How do you want to add it?">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="bevel btn aspect-4/3 flex-col text-[11px] whitespace-normal"
        >
          📷 Take Photo
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="bevel btn aspect-4/3 flex-col text-[11px] whitespace-normal"
        >
          ⬆ Upload Photo
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="microcopy mt-3 text-center text-[var(--color-accent)]">
          {error}
        </p>
      )}

      <p className="microcopy mt-3 text-center">
        one garment per photo, laid flat if you can.
      </p>
    </Panel>
  );
}
