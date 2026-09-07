"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { BevelButton } from "@/components/ui/BevelButton";
import { Select } from "@/components/ui/Select";
import {
  ItemFields,
  EMPTY_ITEM_FORM,
  formToPatch,
  type ItemFormValue,
} from "@/components/closet/ItemFields";
import { createItems } from "@/app/closet/actions";
import { createClient } from "@/lib/supabase/client";
import { ingestPhoto, type IngestedPhoto } from "@/lib/images/ingest";
import { autofillFields } from "@/lib/add/autofill";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { cn } from "@/lib/cn";
import type { Tag } from "@/lib/types";

/**
 * Batch import.
 *
 * The expensive step is background removal — WASM, single-threaded, and
 * the reason photos are cut out strictly one at a time rather than in
 * parallel. Everything that waits on a network instead (metadata, the
 * uploads) runs a few at a time, so those waits hide behind the CPU work
 * rather than adding to it.
 */

const AI_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_METADATA === "true";

const BUCKET = "closet";

/** Cap per import. Keeps browser memory sane and the review grid readable. */
const MAX_FILES = 24;

/** How many metadata calls or uploads may be in flight at once. */
const CONCURRENCY = 4;

/** Runs tasks with at most `limit` in flight, queueing the rest. */
function pool(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

type Entry = {
  id: string;
  fileName: string;
  original: Blob;
  processed: Blob;
  previewUrl: string;
  value: ItemFormValue;
  /** Whatever went sideways on this one photo, in plain words. */
  notice: string | null;
};

type Stage = "pick" | "working" | "review";

type Working = {
  done: number;
  total: number;
  status: string;
  /** Background-removal progress for the photo in hand, 0-1. */
  progress: number;
};

const IDLE: Working = { done: 0, total: 0, status: "", progress: 0 };

export function BulkAddFlow({ allTags }: { allTags: Tag[] }) {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("pick");
  const [working, setWorking] = useState<Working>(IDLE);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Non-null while saving; holds the line shown on the button. */
  const [saving, setSaving] = useState<string | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);

  // Object URLs outlive the component unless revoked, and an import holds
  // one per photo.
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  async function handleFiles(picked: FileList | null) {
    const files = Array.from(picked ?? []).slice(0, MAX_FILES);
    if (files.length === 0) return;

    setStage("working");
    setError(null);
    setSkipped([]);
    setEntries([]);

    const runMetadata = pool(CONCURRENCY);
    const pending: Promise<Entry>[] = [];
    const failed: string[] = [];

    for (const [index, file] of files.entries()) {
      setWorking({
        done: index,
        total: files.length,
        status: "reading the photo...",
        progress: 0,
      });

      let photo: IngestedPhoto;
      try {
        photo = await ingestPhoto(file, {
          onStatus: (status) => setWorking((prev) => ({ ...prev, status })),
          onProgress: (progress) =>
            setWorking((prev) => ({ ...prev, progress })),
        });
      } catch (caught) {
        // One unreadable photo (HEIC, usually) shouldn't sink the import.
        failed.push(
          `${file.name} — ${
            caught instanceof Error ? caught.message : "couldn't be read."
          }`,
        );
        continue;
      }

      const previewUrl = URL.createObjectURL(photo.processed);
      urls.current.push(previewUrl);

      // Deliberately not awaited: the next photo's cut-out starts now, and
      // Claude answers about this one while that runs.
      pending.push(
        (async (): Promise<Entry> => {
          const filled = AI_ENABLED
            ? await runMetadata(() =>
                autofillFields(photo.visionBase64, photo.swatch),
              )
            : {
                value: photo.swatch
                  ? { ...EMPTY_ITEM_FORM, colorHex: photo.swatch }
                  : EMPTY_ITEM_FORM,
                notice: null,
              };

          return {
            id: crypto.randomUUID(),
            fileName: file.name,
            original: photo.original,
            processed: photo.processed,
            previewUrl,
            value: filled.value,
            // The cut-out problem is the more useful one to surface.
            notice: photo.notice ?? filled.notice,
          };
        })(),
      );
    }

    setWorking((prev) => ({
      ...prev,
      done: files.length,
      progress: 0,
      status: AI_ENABLED ? "asking Claude what these are..." : "finishing up...",
    }));

    const ready = await Promise.all(pending);

    setEntries(ready);
    setSkipped(failed);

    if (ready.length === 0) {
      setError("None of those photos could be read.");
      setStage("pick");
      return;
    }

    setStage("review");
  }

  function updateEntry(id: string, value: ItemFormValue) {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, value } : entry)),
    );
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function reset() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setEntries([]);
    setSkipped([]);
    setExpandedId(null);
    setError(null);
    setWorking(IDLE);
    setStage("pick");
  }

  async function saveAll() {
    if (entries.length === 0) return;

    setSaving("uploading...");
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Sign in again.");
      setSaving(null);
      return;
    }

    const uploaded: string[] = [];
    const runUpload = pool(CONCURRENCY);
    let done = 0;

    try {
      // Promise.all keeps input order, so the rows land in the order shown.
      const payload = await Promise.all(
        entries.map((entry) =>
          runUpload(async () => {
            const folder = `${user.id}/${crypto.randomUUID()}`;
            const originalPath = `${folder}/original.jpg`;
            const processedPath = `${folder}/processed.png`;

            const original = await supabase.storage
              .from(BUCKET)
              .upload(originalPath, entry.original, {
                contentType: "image/jpeg",
              });
            if (original.error) throw new Error(original.error.message);
            uploaded.push(originalPath);

            const processed = await supabase.storage
              .from(BUCKET)
              .upload(processedPath, entry.processed, {
                contentType: "image/png",
              });
            if (processed.error) throw new Error(processed.error.message);
            uploaded.push(processedPath);

            done += 1;
            setSaving(`uploading... ${done} of ${entries.length}`);

            return {
              ...formToPatch(entry.value),
              originalImagePath: originalPath,
              processedImagePath: processedPath,
              sourceUrl: null,
              sourceTitle: null,
            };
          }),
        ),
      );

      setSaving("adding to your closet...");

      const result = await createItems(payload);
      if (!result.ok) throw new Error(result.error);

      router.push("/closet");
    } catch (caught) {
      // Don't leave images behind for rows that were never created.
      if (uploaded.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploaded);
      }
      setError(
        caught instanceof Error ? caught.message : "Couldn't save the batch.",
      );
      setSaving(null);
    }
  }

  /* ---------- render ---------------------------------------- */

  const skippedList = skipped.length > 0 && (
    <div className="mb-3 border border-[var(--color-line-soft)] bg-[var(--color-paper-alt)] p-2">
      <p className="microcopy">
        skipped {skipped.length} photo{skipped.length === 1 ? "" : "s"}:
      </p>
      <ul className="microcopy mt-1 space-y-0.5">
        {skipped.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>
    </div>
  );

  if (stage === "working") {
    const { done, total, status, progress } = working;
    return (
      <Panel title="Working on it">
        <div className="py-8 text-center">
          <p className="display text-xs text-[var(--color-accent)]">
            <span className="twinkle">★</span> {status}
          </p>
          <p className="microcopy mt-2">
            photo {Math.min(done + 1, total)} of {total}
            {progress > 0 && progress < 1 && ` — ${Math.round(progress * 100)}%`}
          </p>
          <p className="microcopy mt-4">
            this happens on your own device, so a big batch takes a while.
          </p>
        </div>
      </Panel>
    );
  }

  if (stage === "review") {
    const unnamed = entries.filter((entry) => !entry.value.name.trim()).length;

    return (
      <div className="space-y-4">
        <Panel
          title="Do these look right?"
          meta={`${entries.length} ITEM${entries.length === 1 ? "" : "S"}`}
        >
          {skippedList}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {entries.map((entry) => {
              const expanded = expandedId === entry.id;

              const thumb = (
                <div className="flex aspect-square items-center justify-center border border-[var(--color-line-soft)] bg-[var(--color-paper)] p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.previewUrl}
                    alt={entry.value.name || entry.fileName}
                    className="h-full w-full object-contain"
                  />
                </div>
              );

              return (
                <li
                  key={entry.id}
                  className={cn(
                    "border border-[var(--color-line-soft)] bg-[var(--color-paper-alt)] p-2",
                    expanded && "col-span-full",
                  )}
                >
                  {expanded ? (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="w-full shrink-0 sm:w-40">{thumb}</div>
                      <div className="min-w-0 flex-1">
                        <ItemFields
                          value={entry.value}
                          onChange={(value) => updateEntry(entry.id, value)}
                          allTags={allTags}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {thumb}
                      <input
                        value={entry.value.name}
                        onChange={(event) =>
                          updateEntry(entry.id, {
                            ...entry.value,
                            name: event.target.value,
                          })
                        }
                        placeholder="name it..."
                        aria-label={`Name for ${entry.fileName}`}
                        className="field mt-2 w-full"
                      />
                      <Select
                        label="Category"
                        value={entry.value.category}
                        onChange={(next) =>
                          updateEntry(entry.id, {
                            ...entry.value,
                            category: next as Category,
                            subcategory: "",
                          })
                        }
                        options={CATEGORIES.map((category) => ({
                          value: category,
                          label: CATEGORY_LABELS[category],
                        }))}
                        className="mt-1 w-full"
                      />
                    </>
                  )}

                  {entry.notice && (
                    <p className="microcopy mt-1.5">{entry.notice}</p>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-1">
                    <BevelButton
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      aria-expanded={expanded}
                      className="text-[10px]"
                    >
                      {expanded ? "▴ Less" : "⋯ More"}
                    </BevelButton>
                    <BevelButton
                      onClick={() => removeEntry(entry.id)}
                      disabled={Boolean(saving)}
                      aria-label={`Remove ${entry.value.name || entry.fileName}`}
                      className="text-[10px]"
                    >
                      ✕
                    </BevelButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {unnamed > 0 && (
          <p className="microcopy text-center">
            {unnamed} item{unnamed === 1 ? "" : "s"} still need
            {unnamed === 1 ? "s" : ""} a name.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="microcopy text-center text-[var(--color-accent)]"
          >
            {error}
          </p>
        )}

        <div className="flex justify-between gap-2">
          <BevelButton onClick={reset} disabled={Boolean(saving)}>
            Start over
          </BevelButton>
          <BevelButton
            variant="primary"
            onClick={saveAll}
            disabled={Boolean(saving) || unnamed > 0}
          >
            {saving ?? `✨ Add all ${entries.length} ✨`}
          </BevelButton>
        </div>
      </div>
    );
  }

  return (
    <Panel title="Pick your photos">
      {skippedList}

      <button
        type="button"
        onClick={() => uploadRef.current?.click()}
        className="bevel btn h-24 w-full flex-col text-[11px] whitespace-normal"
      >
        ⬆⬆ Choose Photos
      </button>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          // Let the same files be picked again after a "start over".
          event.target.value = "";
        }}
      />

      {error && (
        <p
          role="alert"
          className="microcopy mt-3 text-center text-[var(--color-accent)]"
        >
          {error}
        </p>
      )}

      <p className="microcopy mt-3 text-center">
        one garment per photo, up to {MAX_FILES} at a time. each one is cut out
        on your own device, so a big batch takes a few minutes.
      </p>
    </Panel>
  );
}
