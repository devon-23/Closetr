import { DressUpBuilder } from "@/components/dressup/DressUpBuilder";
import { getClosetItems } from "@/lib/data/closet";

export const metadata = { title: "My Closet — Dress Up" };

export default async function DressUpPage() {
  const items = await getClosetItems();

  return <DressUpBuilder items={items} />;
}
