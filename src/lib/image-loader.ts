/**
 * Photos at the size they're shown, straight from the services that already host them: Unsplash
 * and Pexels resize from the address, Cloudinary from a transformation in the path. Before this
 * every card downloaded the full 700–900px photo, even as a 56px thumbnail on a phone. Nothing
 * goes through a paid image service. Anything else (the shop's own uploads) is served as it is.
 */
export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  const q = quality ?? 75;
  if (/^(data|blob):/.test(src)) return src;
  let url: URL;
  try {
    url = new URL(src, "http://local.invalid");
  } catch {
    return src;
  }
  if (url.hostname === "images.unsplash.com") {
    // a fixed height (cropped photos) shrinks in step, or the crop would change shape
    const oldWidth = Number(url.searchParams.get("w"));
    const height = Number(url.searchParams.get("h"));
    if (oldWidth && height) url.searchParams.set("h", String(Math.round((height * width) / oldWidth)));
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(q));
    url.searchParams.set("auto", "format");
    return url.toString();
  }
  if (url.hostname === "images.pexels.com") {
    url.searchParams.set("w", String(width));
    url.searchParams.set("auto", "compress");
    url.searchParams.set("cs", "tinysrgb");
    return url.toString();
  }
  if (url.hostname === "res.cloudinary.com" && url.pathname.includes("/image/upload/")) {
    url.pathname = url.pathname.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${width}/`);
    return url.toString();
  }
  // the shop's own uploads: the size is only a hint here, the file is served whole
  if (url.hostname === "local.invalid") return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
  return src;
}
