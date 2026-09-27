import Image from "next/image";

/** A board's cover: its first four photos in a 2×2 grid, blank tiles where there are fewer. */
export function Collage({ images }: { images: (string | undefined)[] }) {
  const tiles = [...images.slice(0, 4), ...Array(Math.max(0, 4 - images.length)).fill(undefined)];
  return (
    <span className="collage" aria-hidden="true">
      {tiles.map((src, index) => (
        <span key={index} className="collage-tile">
          {src && <Image src={src} alt="" fill sizes="120px" unoptimized />}
        </span>
      ))}
    </span>
  );
}
