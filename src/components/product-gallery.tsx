"use client";

import Image from "next/image";
import { useState } from "react";
import { AisleIcon } from "./aisle-icon";

export function ProductGallery({
  images,
  name,
  category,
  mr = false,
}: {
  images: string[];
  name: string;
  category: string;
  mr?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const active = images[selected];
  return (
    <div className="product-gallery">
      <div className={`product-art large${active ? "" : " quiet"}`}>
        {active ? (
          // the largest thing on a product page: fetched ahead of everything that can wait (modern-web-guidance: optimize-image-priority)
          <Image src={active} alt={`${name} product view ${selected + 1}`} fill sizes="(max-width:700px) 100vw, 50vw" fetchPriority="high" className="product-photo" />
        ) : (
          <AisleIcon slug={category} />
        )}
      </div>
      {/* under the photo, not on it: on a phone the photo fills the box and the note covered the pack */}
      {active && <small className="photo-note">{mr ? "उत्पादनाचा प्रातिनिधिक फोटो" : "Representative product photography"}</small>}
      {images.length > 1 && (
        <div className="gallery-thumbs" aria-label="Product images">
          {images.map((image, index) => (
            <button key={`${image}-${index}`} type="button" aria-label={`Show product image ${index + 1}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
              <Image src={image} alt="" fill sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
