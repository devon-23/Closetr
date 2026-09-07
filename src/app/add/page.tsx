import { AddItemFlow } from "@/components/add/AddItemFlow";
import { getAllTags } from "@/lib/data/closet";

export const metadata = { title: "My Closet — Add Item" };

export default async function AddPage() {
  const tags = await getAllTags();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="display text-center text-base">
        <span className="text-[var(--color-accent)]">★</span> Add to Closet{" "}
        <span className="text-[var(--color-accent)]">★</span>
      </h1>

      <AddItemFlow allTags={tags} />
    </div>
  );
}
