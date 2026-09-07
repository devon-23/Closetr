import { ClosetBrowser } from "@/components/closet/ClosetBrowser";
import { getAllTags, getClosetItems } from "@/lib/data/closet";

export const metadata = { title: "My Closet — Closet" };

/** Server component boundary: query here, interactivity below. */
export default async function ClosetPage() {
  const [items, tags] = await Promise.all([getClosetItems(), getAllTags()]);

  return <ClosetBrowser initialItems={items} allTags={tags} />;
}
