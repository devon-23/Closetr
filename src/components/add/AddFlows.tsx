"use client";

import { useState } from "react";
import { TabTray } from "@/components/ui/TabTray";
import { AddItemFlow } from "@/components/add/AddItemFlow";
import { BulkAddFlow } from "@/components/add/BulkAddFlow";
import type { Tag } from "@/lib/types";

/**
 * Picks between adding one item and importing a batch.
 *
 * They stay separate components rather than one flow with a count: the
 * single path gets the camera and the "find this online" lookup, the
 * batch path gets a grid and a progress counter, and squeezing both into
 * one component made every branch worse.
 */

type Mode = "one" | "many";

const MODES = [
  { value: "one" as const, label: "One Item" },
  { value: "many" as const, label: "Many Items" },
];

export function AddFlows({ allTags }: { allTags: Tag[] }) {
  const [mode, setMode] = useState<Mode>("one");

  return (
    <div className="space-y-4">
      <TabTray
        label="How many items are you adding"
        options={MODES}
        value={mode}
        onChange={setMode}
        className="justify-center"
      />

      {mode === "one" ? (
        // The single form is a column of fields; a wide one reads badly.
        <div className="mx-auto max-w-md">
          <AddItemFlow allTags={allTags} />
        </div>
      ) : (
        <BulkAddFlow allTags={allTags} />
      )}
    </div>
  );
}
