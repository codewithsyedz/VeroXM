"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { KeyRound, Pencil, Trash2, X } from "lucide-react";
import { deleteProject, updateProject } from "./actions";

interface EditableProject {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  status: string;
}

export default function EditProjectModal({ project }: { project: EditableProject }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState(project.status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function openModal() {
    // Reset to the current row's values every time it's reopened, in case
    // another tab (or the status badge on this same card) changed them
    // since the last edit.
    setName(project.name);
    setDescription(project.description ?? "");
    setStatus(project.status);
    setError(null);
    setConfirmingDelete(false);
    setConfirmText("");
    setDeleteError(null);
    setOpen(true);
  }

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      try {
        await deleteProject(project.id);
        setOpen(false);
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : "Failed to delete project");
      }
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateProject(project.id, { name, description, status });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save changes");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="icon-button h-7 w-7"
        aria-label={`Edit ${project.name}`}
        title="Project settings"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Project Settings"
            className="surface-standard w-full max-w-md rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-[#f2f3fb]">Project Settings</h2>
                <p className="mt-1 text-sm text-[#b8bfd8]">
                  Configure settings for {project.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-quiet h-10 px-3 text-sm"
                  autoFocus
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter project description"
                  rows={3}
                  className="input-quiet px-3 py-2 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Environment</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input-quiet h-10 px-3 text-sm"
                >
                  <option value="live" className="bg-[#0b0c22]">
                    Live
                  </option>
                  <option value="staging" className="bg-[#0b0c22]">
                    Staging
                  </option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#f2f3fb]">Project Slug</span>
                <input
                  value={project.slug ?? "—"}
                  disabled
                  className="input-quiet h-10 cursor-not-allowed px-3 font-mono-code text-sm opacity-60"
                />
                <span className="text-xs text-[#7680a3]">Slug cannot be changed</span>
              </label>

              <div className="flex flex-col gap-1.5 border-t border-white/[0.07] pt-4">
                <span className="text-sm font-medium text-[#f2f3fb]">API access</span>
                <Link
                  href={`/projects/${project.id}/access`}
                  onClick={() => setOpen(false)}
                  className="inline-flex w-fit items-center gap-1.5 text-sm text-[#4da3ff] hover:text-white"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Manage API tokens
                </Link>
                <span className="text-xs text-[#7680a3]">
                  Tokens are issued and revoked from the project’s Developer page — there’s no single
                  fixed key to show here.
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[rgba(234,109,118,0.35)] p-4">
                <span className="text-sm font-medium text-[#ea6d76]">Danger Zone</span>
                <p className="text-xs text-[#7680a3]">
                  Permanently deletes this project’s collections, fields, content, and media.
                  Requests to its public API endpoint stop working immediately. Only a super admin
                  can do this.
                </p>

                {!confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="button-secondary inline-flex w-fit items-center gap-1.5 border-[rgba(234,109,118,0.35)] px-3 text-xs text-[#ea6d76] hover:bg-[rgba(234,109,118,0.1)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete Project
                  </button>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-[#b8bfd8]">
                        Type <span className="font-mono-code text-[#f2f3fb]">{project.name}</span>{" "}
                        to confirm
                      </span>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="input-quiet h-9 px-3 text-xs"
                        autoFocus
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingDelete(false);
                          setConfirmText("");
                          setDeleteError(null);
                        }}
                        className="button-secondary px-3 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting || confirmText !== project.name}
                        onClick={handleDelete}
                        className="inline-flex h-9 items-center rounded-lg bg-[#ea6d76] px-3 text-xs font-medium text-white transition-colors hover:bg-[#d85c66] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting…" : "Delete Permanently"}
                      </button>
                    </div>
                    {deleteError && <p className="text-xs text-[#ea6d76]">{deleteError}</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="button-secondary px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || !name.trim()}
                onClick={submit}
                className="button-primary px-4"
              >
                {isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>

            {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
