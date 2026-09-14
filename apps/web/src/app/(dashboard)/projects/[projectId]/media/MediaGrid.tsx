"use client";

import { useRef, useState, useTransition } from "react";
import { FileQuestion, Trash2, Upload } from "lucide-react";
import { deleteMedia, updateCaption, uploadMedia } from "./actions";

export interface MediaItem {
  id: number;
  fileName: string;
  fullUrl: string;
  thumbUrl: string | null;
  caption: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function MediaCard({ projectId, item }: { projectId: string; item: MediaItem }) {
  const [caption, setCaption] = useState(item.caption ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const extension = item.fileName.split(".").pop();

  return (
    <figure className="surface-standard flex flex-col overflow-hidden rounded-xl">
      <div className="surface-inset flex h-36 items-center justify-center overflow-hidden border-0 border-b border-white/[0.06]">
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt={item.fileName} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-[#7680a3]">
            <FileQuestion className="h-5 w-5" aria-hidden="true" />
            <span className="font-mono-code text-[10px] uppercase">{extension}</span>
          </span>
        )}
      </div>

      <figcaption className="flex flex-1 flex-col gap-2.5 p-4">
        <a
          href={item.fullUrl}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm font-medium text-[#f2f3fb] hover:text-[#4da3ff]"
          title={item.fileName}
        >
          {item.fileName}
        </a>

        <p className="font-mono-code text-[11px] text-[#7680a3]">
          {formatSize(item.size)}
          {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
        </p>

        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => {
            if (caption === (item.caption ?? "")) return;
            setError(null);
            startTransition(async () => {
              try {
                await updateCaption(projectId, item.id, caption);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to save caption");
              }
            });
          }}
          placeholder="Caption"
          aria-label={`Caption for ${item.fileName}`}
          className="input-quiet h-9 px-3 text-xs"
        />

        {error && <p className="text-[11px] text-[#ea6d76]">{error}</p>}

        <button
          type="button"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await deleteMedia(projectId, item.id);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to delete");
              }
            });
          }}
          disabled={isPending}
          className="icon-button -ml-2 self-start text-[#ea6d76] disabled:text-[#7680a3]"
          aria-label={`Delete ${item.fileName}`}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </figcaption>
    </figure>
  );
}

export default function MediaGrid({
  projectId,
  initialMedia,
}: {
  projectId: string;
  initialMedia: MediaItem[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isUploading, startUpload] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(formData: FormData) {
    setError(null);
    startUpload(async () => {
      try {
        await uploadMedia(projectId, formData);
        formRef.current?.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formRef}
        action={handleUpload}
        className="surface-inset flex flex-wrap items-center gap-3 rounded-xl px-4 py-3.5"
      >
        <input
          type="file"
          name="file"
          required
          aria-label="File to upload"
          className="max-w-full text-xs text-[#b8bfd8] file:mr-3 file:rounded-md file:border file:border-white/[0.12] file:bg-white/[0.03] file:px-3 file:py-1.5 file:text-xs file:text-[#b8bfd8] hover:file:bg-white/[0.06]"
        />
        <button type="submit" disabled={isUploading} className="button-primary px-4">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {isUploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && <p className="text-xs text-[#ea6d76]">{error}</p>}

      {initialMedia.length === 0 ? (
        <div className="surface-standard rounded-2xl p-10 text-center">
          <p className="text-sm text-[#b8bfd8]">No files yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {initialMedia.map((item) => (
            <MediaCard key={item.id} projectId={projectId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
