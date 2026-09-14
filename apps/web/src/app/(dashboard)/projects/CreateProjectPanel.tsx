"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import InlineAlert from "@/components/InlineAlert";
import { createProject } from "./actions";

// Same slugify()/"touched" convention CollectionsList.tsx already uses for
// its own create form — kept in sync with the name field until the user
// edits the slug directly, same behavior either place.
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface ProjectFormState {
  name: string;
  slug: string;
  description: string;
}

const EMPTY: ProjectFormState = { name: "", slug: "", description: "" };

export default function CreateProjectPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProjectFormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setSlugTouched(false);
    setError(null);
    setSaved(false);
  }

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        // defaultLocale and status aren't asked here — they default to
        // "en" and "live" server-side (see ProjectsService.create). Change
        // status afterward from the project card's status badge.
        await createProject({
          name: form.name,
          slug: form.slug || slugify(form.name),
          description: form.description,
        });
        // Stay open with a confirmation rather than closing immediately —
        // the new project already appears in the list behind this modal
        // (revalidatePath), so there's no reason to rush the user out.
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create project");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="button-primary px-4">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Create project
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create New Project"
            className="surface-standard w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-[#f2f3fb]">Create New Project</h2>
                <p className="mt-1 text-sm text-[#b8bfd8]">
                  Create a new project to organize your content models and API access.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="icon-button h-8 w-8 shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Project Name</span>
                <input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: slugTouched ? f.slug : slugify(name),
                    }));
                  }}
                  placeholder="My Project"
                  className="input-quiet h-10 px-3 text-sm"
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Slug</span>
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  placeholder={form.name ? slugify(form.name) : "my-project"}
                  className="input-quiet h-10 px-3 font-mono-code text-sm"
                />
                <span className="text-xs text-[#7680a3]">
                  URL-friendly identifier for your project — you won’t be able to change this
                  after creating it.
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe your project..."
                  rows={3}
                  className="input-quiet px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={close} className="button-secondary px-4">
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !form.name.trim()}
                onClick={submit}
                className="button-primary px-4"
              >
                {isPending ? "Creating…" : "Create Project"}
              </button>
            </div>

            {saved && (
              <div className="mt-3">
                <InlineAlert
                  tone="success"
                  message={`“${form.name}” created.`}
                  onDismiss={() => setSaved(false)}
                  autoDismissMs={4000}
                />
              </div>
            )}
            {error && (
              <div className="mt-3">
                <InlineAlert tone="error" message={error} onDismiss={() => setError(null)} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
