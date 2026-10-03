"use client";

import Image from "next/image";
import { useState } from "react";
import { AisleIcon } from "./aisle-icon";

export function ProductGallery({
  images,
  name,
  category,
}: {
  images: string[];
  name: string;
  category: string;
}) {
  const [selected, setSelected] = useState(0);
  const active = images[selected];
  return (
    <div className="product-gallery">
      <div className={`product-art large${active ? "" : " quiet"}`}>
        {active ? (
          <Image src={active} alt={`${name} product view ${selected + 1}`} fill sizes="(max-width:700px) 100vw, 50vw" loading="eager" className="product-photo" />
        ) : (
          <AisleIcon slug={category} />
        )}
        {active && <small className="photo-note">Representative product photography</small>}
      </div>
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
