"use client";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { shrink } from "@/components/photo-input";
import { uploadTeamPhotoAction } from "@/lib/settings/actions";

/** The framed photo is saved this many pixels square: sharp in a 120px circle on a 3× phone screen. */
const OUT = 512;

type Framing = { img: HTMLImageElement; src: string; zoom: number; x: number; y: number };

/** The picked photo as a data: address (the site's security policy allows those, not blob:), shrunk first so a 12 MB camera photo stays light. */
async function readPhoto(file: File) {
  const small = await shrink(file).catch(() => file);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(small);
  });
}

/*
 * Lengths below are in "stage widths": the square editor is 1 across. At zoom 1 the photo's short side
 * fills the square; x and y place the photo's top-left corner, and never leave a gap inside the square.
 */
const sides = (img: HTMLImageElement) => {
  const short = Math.min(img.naturalWidth, img.naturalHeight);
  return { w: img.naturalWidth / short, h: img.naturalHeight / short, short };
};
function fit(frame: Framing): Framing {
  const { w, h } = sides(frame.img);
  const clamp = (value: number, size: number) => Math.min(0, Math.max(1 - size * frame.zoom, value));
  return { ...frame, x: clamp(frame.x, w), y: clamp(frame.y, h) };
}

/** The square the circle shows, cut from the photo at full quality. */
async function framed(frame: Framing): Promise<File> {
  const { short } = sides(frame.img);
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, OUT, OUT);
  const size = short / frame.zoom;
  context.drawImage(frame.img, (-frame.x * short) / frame.zoom, (-frame.y * short) / frame.zoom, size, size, 0, 0, OUT, OUT);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw Error("frame");
  return new File([blob], "photo.jpg", { type: "image/jpeg", lastModified: Date.now() });
}

/**
 * Settings → Developer and team → Your photo: a picked photo opens in a square with the circle the
 * card shows marked on it; drag it and zoom until it sits right, then Use this photo uploads just that
 * 512px square and fills the form's field. Save puts it on the card.
 */
export function TeamPhotoField({ name, label, hint, value }: { name: string; label: string; hint?: string; value: string }) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [frame, setFrame] = useState<Framing | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  async function open(file: File) {
    const failed = () => setNote({ text: "This photo can’t be opened. Use a JPG, PNG or WebP photo.", error: true });
    setNote({ text: "Opening photo…" });
    const src = await readPhoto(file).catch(() => null);
    if (!src) return failed();
    const img = new Image();
    img.onload = () => {
      const { w, h } = sides(img);
      setNote(null);
      setFrame({ img, src, zoom: 1, x: (1 - w) / 2, y: (1 - h) / 2 });
    };
    img.onerror = failed;
    img.src = src;
  }

  const close = () => setFrame(null);

  async function upload(file: File) {
    setBusy(true);
    setNote({ text: "Uploading photo…" });
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await uploadTeamPhotoAction(body);
      if (result.url) {
        setUrl(result.url);
        setNote({ text: "Photo ready. Save to put it on the card." });
      } else setNote({ text: result.error ?? "Unable to upload this photo. Please try again.", error: true });
    } catch {
      setNote({ text: "Unable to upload this photo. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function use() {
    if (!frame) return;
    try {
      const file = await framed(frame);
      close();
      await upload(file);
    } catch {
      setNote({ text: "Unable to prepare this photo. Please choose it again.", error: true });
    }
  }

  // zooming keeps whatever is in the middle of the circle in the middle
  function zoomTo(zoom: number) {
    if (!frame) return;
    const { w, h } = sides(frame.img);
    const u = (0.5 - frame.x) / (w * frame.zoom);
    const v = (0.5 - frame.y) / (h * frame.zoom);
    setFrame(fit({ ...frame, zoom, x: 0.5 - u * w * zoom, y: 0.5 - v * h * zoom }));
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!frame) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { px: event.clientX, py: event.clientY, x: frame.x, y: frame.y };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const across = stage.current?.clientWidth;
    if (!start || !frame || !across) return;
    setFrame(fit({ ...frame, x: start.x + (event.clientX - start.px) / across, y: start.y + (event.clientY - start.py) / across }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!frame) return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    setFrame(fit({ ...frame, x: frame.x + step[0] * 0.02, y: frame.y + step[1] * 0.02 }));
  };

  const shape = frame && sides(frame.img);
  return (
    <div className="team-photo-field">
      <span className="team-photo-label">
        {label} {hint && <small>{hint}</small>}
      </span>
      {frame && shape ? (
        <div className="photo-crop">
          <p className="muted">Drag the photo to place the face in the circle, and zoom to make it bigger.</p>
          <div
            ref={stage}
            className="photo-crop-stage"
            tabIndex={0}
            role="group"
            aria-label={`${label}. Drag it, or use the arrow keys, to move it in the circle.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={onKeyDown}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a photo still on this phone, not yet uploaded */}
            <img
              src={frame.src}
              alt=""
              draggable={false}
              style={{
                left: `${frame.x * 100}%`,
                top: `${frame.y * 100}%`,
                width: `${shape.w * frame.zoom * 100}%`,
                height: `${shape.h * frame.zoom * 100}%`,
              }}
            />
            <span className="photo-crop-ring" aria-hidden="true" />
          </div>
          <label className="photo-crop-zoom">
            Zoom
            <input type="range" min={1} max={4} step={0.01} value={frame.zoom} onChange={(event) => zoomTo(Number(event.currentTarget.value))} />
          </label>
          <div className="team-photo-actions">
            <button type="button" className="primary-button" onClick={use}>
              Use this photo
            </button>
            <button type="button" className="text-button" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="team-photo-row">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a preview of a just-uploaded photo
            <img src={url} alt={label} className="dev-photo" />
          ) : (
            <span className="dev-photo is-empty" aria-hidden="true">
              <ImagePlus size={28} />
            </span>
          )}
          <div className="team-photo-actions">
            <label className={`secondary-button${busy ? " is-busy" : ""}`}>
              <ImagePlus size={18} aria-hidden="true" />
              {url ? "Change photo" : "Choose a photo"}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void open(file);
                }}
              />
            </label>
            {url && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setUrl("");
                  setNote({ text: "Photo removed. Save to take it off the card." });
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                Remove photo
              </button>
            )}
          </div>
        </div>
      )}
      {note && (
        <p role={note.error ? "alert" : "status"} className={note.error ? "error-message" : "muted"}>
          {note.text}
        </p>
      )}
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
