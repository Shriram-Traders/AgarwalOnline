"use client";
import { useEffect, useRef, useState } from "react";

/** The server refuses bodies over this (next.config.ts serverActions.bodySizeLimit leaves room for the form fields). */
export const MAX_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE = 1600;

/**
 * Phone cameras take 3–12 MB photos, far over what an upload on a weak connection (or the
 * server) will take, so shrink the photo in the browser first: 1600px on the long edge as a
 * JPEG is a few hundred KB and still plenty for a product card or proof of delivery.
 */
export async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 900 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency: paint white first so a transparent PNG doesn't turn black
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A photo picker for upload forms: shrinks big camera photos before the form is sent. */
export function PhotoInput({ name = "file", required = true }: { name?: string; required?: boolean }) {
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // a successful upload empties the form; drop the "Photo ready" note with it (a failed one keeps both)
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () =>
      setTimeout(() => {
        if (!inputRef.current?.files?.length) setNote(null);
      });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        required={required}
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.setCustomValidity("");
          if (!file) return setNote(null);
          // block the submit button (via the browser's own validation) until the photo is ready
          input.setCustomValidity("Please wait, the photo is being prepared.");
          setNote({ text: "Preparing photo…" });
          const small = await shrink(file).catch(() => file);
          if (small !== file) {
            const files = new DataTransfer();
            files.items.add(small);
            input.files = files.files;
          }
          if (small.size > MAX_BYTES) {
            input.setCustomValidity("This photo is too large. Please choose a smaller one.");
            setNote({ text: `This photo is too large (${size(small.size)}). Please choose a smaller one.`, error: true });
            return;
          }
          input.setCustomValidity("");
          setNote({ text: `Photo ready · ${size(small.size)}` });
        }}
      />
      {note && (
        <small className={note.error ? "error-message" : "muted"} role={note.error ? "alert" : "status"}>
          {note.text}
        </small>
      )}
    </>
  );
}
