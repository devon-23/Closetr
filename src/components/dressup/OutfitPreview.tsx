import { GarmentGlyph } from "@/components/ui/GarmentGlyph";
import { cn } from "@/lib/cn";
import type { Slot } from "@/lib/categories";
import type { ClothingItem } from "@/lib/types";

type OutfitPreviewProps = {
  pieces: { item: ClothingItem; slot: Slot }[];
  className?: string;
};

/**
 * The flat lay.
 *
 * Every piece is absolutely positioned from its resolved slot: `x`/`y`
 * are the centre point as a percentage, `scale` is the width as a
 * fraction of the box. Because ingest normalises every PNG onto the
 * same square canvas, a uniform percentage produces sensible relative
 * sizes — a coat reads bigger than a sneaker with no manual sizing.
 *
 * Pieces arrive pre-sorted by z, so DOM order is paint order and we
 * don't need a z-index on each one.
 */
export function OutfitPreview({ pieces, className }: OutfitPreviewProps) {
  return (
    <div
      className={cn(
        "relative aspect-3/4 w-full overflow-hidden border border-[var(--color-line)] bg-[var(--color-paper)]",
        className,
      )}
      role="img"
      aria-label={
        pieces.length === 0
          ? "Empty outfit"
          : `Outfit with ${pieces.map((piece) => piece.item.name).join(", ")}`
      }
    >
      {pieces.length === 0 ? (
        <p className="microcopy absolute inset-0 flex items-center justify-center text-center">
          nothing picked yet!
          <br />
          choose something below ↓
        </p>
      ) : (
        pieces.map(({ item, slot }) => (
          <div
            key={item.id}
            className="absolute transition-all duration-150 ease-out"
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `${slot.scale * 100}%`,
              transform: `translate(-50%, -50%) rotate(${slot.rotate ?? 0}deg)`,
            }}
          >
            {item.processedImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.processedImageUrl}
                alt=""
                className="h-full w-full object-contain drop-shadow-[1px_2px_2px_rgba(43,37,51,0.18)]"
              />
            ) : (
              <GarmentGlyph
                category={item.category}
                color={item.colorHex}
                className="h-full w-full drop-shadow-[1px_2px_2px_rgba(43,37,51,0.18)]"
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
