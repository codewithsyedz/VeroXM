"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates-data";
import { createProjectFromTemplate } from "./actions";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function TemplateCard({
  template,
  onUse,
}: {
  template: ProjectTemplate;
  onUse: (template: ProjectTemplate) => void;
}) {
  const Icon = template.icon;
  return (
    <article className="surface-standard flex flex-col rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[#7680a3]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-medium text-[#f2f3fb]">{template.name}</h3>
            <span className="mt-1 inline-block rounded border border-[rgba(77,163,255,0.25)] bg-[rgba(69,49,224,0.14)] px-1.5 py-0.5 font-mono-code text-[10px] text-[#4da3ff]">
              {template.category}
            </span>
          </div>
        </div>
        {template.featured && (
          <Star className="h-4 w-4 shrink-0 fill-[#4da3ff] text-[#4da3ff]" aria-hidden="true" />
        )}
      </div>

      <p className="mt-3 text-sm leading-6 text-[#b8bfd8]">{template.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {template.includes.map((item) => (
          <span
            key={item}
            className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-[#b8bfd8]"
          >
            {item}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onUse(template)}
        className="button-primary mt-5 w-full justify-center"
      >
        Use Template
      </button>
    </article>
  );
}

function UseTemplateModal({
  template,
  onClose,
}: {
  template: ProjectTemplate;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const collections = template.includes.map((item) => ({
          name: item,
          slug: slugify(item),
        }));
        const project = await createProjectFromTemplate(name, template.description, collections);
        router.push(`/projects/${project.id}/collections`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create project from template");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Use ${template.name} template`}
        className="surface-standard w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-[#f2f3fb]">Use {template.name}</h2>
            <p className="mt-1 text-sm text-[#b8bfd8]">
              Creates a new project and seeds it with {pluralizeCount(template.includes.length)}{" "}
              — empty, ready for you to define fields on each.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
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

          <div className="flex flex-wrap gap-1.5">
            {template.includes.map((item) => (
              <span
                key={item}
                className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-[#b8bfd8]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="button-secondary px-4">
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending || !name.trim()}
            onClick={submit}
            className="button-primary px-4"
          >
            {isPending ? "Creating…" : "Create Project"}
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}
      </div>
    </div>
  );
}

function pluralizeCount(n: number) {
  return `${n} collection${n === 1 ? "" : "s"}`;
}

export default function TemplatesGrid() {
  const [active, setActive] = useState<ProjectTemplate | null>(null);
  const featured = PROJECT_TEMPLATES.filter((t) => t.featured);
  const rest = PROJECT_TEMPLATES.filter((t) => !t.featured);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-[#f2f3fb]">Featured Templates</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {featured.map((template) => (
          <TemplateCard key={template.id} template={template} onUse={setActive} />
        ))}
      </div>

      <h2 className="mt-10 text-sm font-medium text-[#f2f3fb]">All Templates</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rest.map((template) => (
          <TemplateCard key={template.id} template={template} onUse={setActive} />
        ))}
      </div>

      {active && <UseTemplateModal template={active} onClose={() => setActive(null)} />}
    </div>
  );
}
