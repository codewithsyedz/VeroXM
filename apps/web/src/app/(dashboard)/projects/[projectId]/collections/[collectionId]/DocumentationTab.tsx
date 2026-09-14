import { typeLabel, isRequired, type FieldItem, type SiblingCollection } from "@/lib/fields";
import GeneratedContract from "./GeneratedContract";

// Documentation — auto-generated from the collection's real field
// definitions (same data GeneratedContract already projects into a public-
// API contract). No stored prose, no separate "docs" table: this is a
// read-only view of the schema as it stands right now, same as the rest of
// this content-model screen. No legacy precedent.
export default function DocumentationTab({
  collectionName,
  collectionSlug,
  description,
  fields,
  siblings,
}: {
  collectionName: string;
  collectionSlug: string;
  description: string | null;
  fields: FieldItem[];
  siblings: SiblingCollection[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="surface-standard rounded-2xl p-5">
        <h2 className="text-sm font-medium text-[#f2f3fb]">{collectionName}</h2>
        <p className="mt-1 text-sm text-[#b8bfd8]">
          {description || "No description set for this collection yet."}
        </p>
        <p className="mt-3 font-mono-code text-[11px] text-[#7680a3]">
          Slug: #{collectionSlug} · {fields.length} field{fields.length === 1 ? "" : "s"}
        </p>
      </section>

      <section className="surface-standard overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.07] px-5 py-4">
          <h2 className="text-sm font-medium text-[#f2f3fb]">Field Reference</h2>
        </header>
        {fields.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[#b8bfd8]">No fields defined yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wide text-[#7680a3]">
                  <th className="px-5 py-2.5 font-medium">Field</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">Required</th>
                  <th className="px-5 py-2.5 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id} className="border-b border-white/[0.05] last:border-b-0">
                    <td className="px-5 py-2.5">
                      <p className="text-[#f2f3fb]">{field.label}</p>
                      <p className="font-mono-code text-[11px] text-[#7680a3]">{field.name}</p>
                    </td>
                    <td className="px-5 py-2.5 text-[#b8bfd8]">{typeLabel(field.type)}</td>
                    <td className="px-5 py-2.5 text-[#b8bfd8]">
                      {isRequired(field) ? "Yes" : "No"}
                    </td>
                    <td className="px-5 py-2.5 text-[#7680a3]">{field.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <GeneratedContract collectionSlug={collectionSlug} fields={fields} siblings={siblings} />
    </div>
  );
}
