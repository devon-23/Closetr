import { AddFlows } from "@/components/add/AddFlows";
import { getAllTags } from "@/lib/data/closet";

export const metadata = { title: "My Closet — Add Item" };

export default async function AddPage() {
  const tags = await getAllTags();

  return (
    // Wide enough for the batch review grid; the single form re-narrows
    // itself so it doesn't sprawl.
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="display text-center text-base">
        <span className="text-[var(--color-accent)]">★</span> Add to Closet{" "}
        <span className="text-[var(--color-accent)]">★</span>
      </h1>

      <AddFlows allTags={tags} />
    </div>
  );
}
