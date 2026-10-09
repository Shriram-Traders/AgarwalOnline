"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Star, Trash2 } from "lucide-react";
import { saveProductPhotosAction, uploadProductPhotoAction, type PhotoUploadState } from "@/lib/catalog/photo-actions";
import { MAX_PHOTOS } from "@/lib/catalog/photos";
import { CONNECTION_ERROR, safeAction } from "./safe-action";
import { MAX_BYTES, shrink, size } from "./photo-input";

const save = safeAction(saveProductPhotosAction);

/** Only a mouse drags photos into place; fingers use the arrows. */
function subscribePointer(onChange: () => void) {
  const query = window.matchMedia("(pointer: fine)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const finePointer = () => window.matchMedia("(pointer: fine)").matches;
const noPointer = () => false;

type Note = { text: string; tone: "ok" | "error" | "info" };

/**
 * A product's photos, in order: the first is the cover that cards, search, the basket and the
 * shop's first picture use. Pick several at once (each is shrunk in the browser, then uploaded in
 * turn), add one from a link, move photos with the arrows (or drag them on a computer), make one
 * the cover, or remove one.
 *
 * - "edit": uploads join the product at once; a new order is kept with "Save photo order".
 * - "draft" (Add product): uploads wait as drafts, and the list goes with the form as `images`.
 */
export function ProductPhotos({
  mode,
  productId,
  initial,
  fallback,
  name,
}: {
  mode: "edit" | "draft";
  productId?: string;
  initial: string[];
  /** The built-in demo photo a product shows until it has one of its own. */
  fallback?: string;
  name: string;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();
  const canDrag = useSyncExternalStore(subscribePointer, finePointer, noPointer);
  const root = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // uploads arrive one by one while the list may change; count room against the latest list
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);

  const unsaved = mode === "edit" && photos.join("\n") !== saved.join("\n");
  const full = photos.length >= MAX_PHOTOS;

  // leaving with a new order not saved asks first
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Add product: once the form is sent, the panel starts empty again (a failed send keeps it)
  useEffect(() => {
    if (mode !== "draft") return;
    const form = root.current?.closest("form");
    if (!form) return;
    const onReset = (event: Event) =>
      setTimeout(() => {
        if (event.defaultPrevented) return;
        setPhotos([]);
        setNote(null);
      });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [mode]);

  const change = (next: string[]) => {
    setPhotos(next);
    setRemoving(null);
    setNote(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [photo] = next.splice(from, 1);
    next.splice(to, 0, photo);
    change(next);
  };

  async function addFiles(files: File[]) {
    const room = MAX_PHOTOS - latest.current.length;
    const chosen = files.slice(0, Math.max(0, room));
    const problems: string[] = [];
    if (files.length > chosen.length)
      problems.push(`Only ${MAX_PHOTOS} photos fit, so ${files.length - chosen.length} ${files.length - chosen.length === 1 ? "wasn’t" : "weren’t"} added.`);
    let added = 0;
    for (const [index, file] of chosen.entries()) {
      setBusy(chosen.length > 1 ? `Uploading ${index + 1} of ${chosen.length}…` : "Uploading the photo…");
      const small = await shrink(file).catch(() => file);
      if (small.size > MAX_BYTES) {
        problems.push(`${file.name} is too large (${size(small.size)}).`);
        continue;
      }
      const form = new FormData();
      form.set("file", small);
      form.set("purpose", mode === "edit" ? "product" : "product-draft");
      if (productId) form.set("productId", productId);
      let result: PhotoUploadState;
      try {
        result = await uploadProductPhotoAction(form);
      } catch {
        result = { error: CONNECTION_ERROR };
      }
      if (result.url) {
        const url = result.url;
        added += 1;
        setPhotos((list) => [...list, url]);
        // on Edit product the upload is already part of the product
        if (mode === "edit") setSaved((list) => [...list, url]);
      } else if (result.error) problems.push(result.error);
    }
    setBusy(null);
    if (picker.current) picker.current.value = "";
    if (added && mode === "edit") router.refresh();
    setNote(
      problems.length
        ? { text: [added ? `${added} added.` : "", ...problems].filter(Boolean).join(" "), tone: "error" }
        : { text: added === 1 ? "Photo added." : `${added} photos added.`, tone: "ok" },
    );
  }

  const addLink = () => {
    const url = link.trim();
    if (!/^https:\/\/\S+$/i.test(url)) return setNote({ text: "Paste a photo link that starts with https://", tone: "error" });
    if (photos.includes(url)) return setNote({ text: "That photo is already in the list.", tone: "error" });
    if (full) return;
    change([...photos, url]);
    setLink("");
    setNote({
      text: mode === "edit" ? "Photo added. Save the photo order to keep it." : "Photo added.",
      tone: "info",
    });
  };

  const saveOrder = () =>
    startSaving(async () => {
      const form = new FormData();
      form.set("productId", productId ?? "");
      for (const url of photos) form.append("images", url);
      const result = await save({}, form);
      startSaving(() => {
        if (result.error) return setNote({ text: result.error, tone: "error" });
        setSaved(photos);
        setNote({ text: result.success ?? "Photos saved.", tone: "ok" });
        router.refresh();
      });
    });

  return (
    <div className="product-photos" ref={root}>
      {photos.length === 0 && fallback && (
        <figure className="product-photos-demo">
          <span className="product-photos-thumb">
            <Image src={fallback} alt="" fill sizes="120px" />
          </span>
          <figcaption className="muted">A built-in demo photo shows until you add your own.</figcaption>
        </figure>
      )}
      {photos.length > 0 && (
        <ol className="product-photos-list" aria-label={`Photos of ${name}, the first is the cover`}>
          {photos.map((url, index) => (
            <li
              key={url}
              aria-label={`Photo ${index + 1} of ${photos.length}${index === 0 ? ", cover" : ""}`}
              className={`${index === 0 ? "is-cover" : ""}${dragging === index ? " is-dragging" : ""}`}
              draggable={canDrag}
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) move(dragging, index);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
            >
              <span className="product-photos-thumb">
                <Image src={url} alt="" fill sizes="(max-width: 760px) 30vw, 140px" />
                {index === 0 && (
                  <span className="product-photos-cover">
                    <Star size={12} aria-hidden="true" /> Cover
                  </span>
                )}
              </span>
              {removing === index ? (
                <span className="product-photos-confirm" role="group" aria-label={`Remove photo ${index + 1}?`}>
                  <span>Remove?</span>
                  <button type="button" className="secondary-button compact-button" onClick={() => change(photos.filter((_, i) => i !== index))}>
                    Yes
                  </button>
                  <button type="button" className="text-button" onClick={() => setRemoving(null)}>
                    No
                  </button>
                </span>
              ) : (
                <span className="product-photos-tools">
                  <button type="button" className="icon-tool" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move photo ${index + 1} earlier`} title="Move earlier">
                    <ArrowLeft size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-tool" onClick={() => move(index, index + 1)} disabled={index === photos.length - 1} aria-label={`Move photo ${index + 1} later`} title="Move later">
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  {index > 0 && (
                    <button type="button" className="icon-tool" onClick={() => move(index, 0)} aria-label={`Make photo ${index + 1} the cover`} title="Make cover">
                      <Star size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" className="icon-tool is-danger" onClick={() => setRemoving(index)} aria-label={`Remove photo ${index + 1}`} title="Remove">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </span>
              )}
              {mode === "draft" && <input type="hidden" name="images" value={url} />}
            </li>
          ))}
        </ol>
      )}

      <div className="product-photos-add">
        <label className={`secondary-button product-photos-pick${full || busy ? " is-disabled" : ""}`}>
          <ImagePlus size={18} aria-hidden="true" />
          {photos.length ? "Add more photos" : "Add photos"}
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={full || Boolean(busy)}
            onChange={(event) => {
              const files = [...(event.currentTarget.files ?? [])];
              if (files.length) void addFiles(files);
            }}
          />
        </label>
        <small className="muted">
          {full
            ? `That’s the most: ${MAX_PHOTOS} photos. Remove one to add another.`
            : `Up to ${MAX_PHOTOS} photos, JPG, PNG or WebP. Pick several at once; big phone photos are made smaller.`}
        </small>
      </div>

      <details className="product-photos-link">
        <summary>
          <Link2 size={16} aria-hidden="true" /> Add a photo from a link
        </summary>
        <div className="product-photos-link-row">
          <label>
            <span className="sr-only">Photo link</span>
            <input
              type="url"
              inputMode="url"
              value={link}
              placeholder="https://…"
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                // inside the Add product form, Enter adds the link instead of sending the product
                if (event.key !== "Enter") return;
                event.preventDefault();
                addLink();
              }}
              disabled={full}
            />
          </label>
          <button type="button" className="secondary-button compact-button" onClick={addLink} disabled={full || !link.trim()}>
            Add
          </button>
        </div>
      </details>

      <p role="status" className={note || busy ? `product-photos-note is-${busy ? "info" : note?.tone}` : "sr-only"}>
        {busy ?? note?.text ?? ""}
      </p>

      {mode === "edit" && (photos.length > 0 || saved.length > 0) && (
        <div className="product-photos-save">
          {unsaved && <span className="unsaved-tag">Unsaved changes</span>}
          <button type="button" className="primary-button" onClick={saveOrder} disabled={!unsaved || saving || Boolean(busy)} aria-busy={saving}>
            {saving ? "Saving…" : "Save photo order"}
          </button>
        </div>
      )}
    </div>
  );
}
