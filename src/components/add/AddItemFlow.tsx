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
import {
  VISION_MAX_EDGE,
  blobToBase64,
  blobToBitmap,
  downscale,
} from "@/lib/images/process";
import type { SearchCandidate, Tag } from "@/lib/types";

const AI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_METADATA === "true";
const SEARCH_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ONLINE_SEARCH === "true";

const BUCKET = "closet";

type Stage = "pick" | "working" | "review";

type Source = { url: string; title: string } | null;

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
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

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
        body: JSON.stringify({
          imageBase64: await blobToBase64(
            await downscale(
              await blobToBitmap(original),
              VISION_MAX_EDGE,
              "image/jpeg",
            ),
          ),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Search failed.");
        setCandidates([]);
        return;
      }
      setCandidates(payload.candidates ?? []);
    } catch {
      setError("Couldn't reach the search service.");
      setCandidates([]);
    } finally {
      setSearching(false);
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
            {source ? (
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[12px]">{source.title}</p>
                <BevelButton onClick={() => setSource(null)}>
                  Clear
                </BevelButton>
              </div>
            ) : (
              <>
                <BevelButton onClick={findOnline} disabled={searching}>
                  {searching ? "Looking..." : "🔎 Find this online"}
                </BevelButton>

                {candidates?.length === 0 && (
                  <p className="microcopy mt-2">no matches found.</p>
                )}

                {candidates && candidates.length > 0 && (
                  <ul className="mt-2 divide-y divide-[var(--color-line-soft)]">
                    {candidates.map((candidate) => (
                      <li
                        key={candidate.url}
                        className="flex items-center justify-between gap-2 py-1.5"
                      >
                        <span className="truncate text-[12px]">
                          {candidate.title}
                        </span>
                        <BevelButton
                          onClick={() =>
                            setSource({
                              url: candidate.url,
                              title: candidate.title,
                            })
                          }
                        >
                          Use
                        </BevelButton>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
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
