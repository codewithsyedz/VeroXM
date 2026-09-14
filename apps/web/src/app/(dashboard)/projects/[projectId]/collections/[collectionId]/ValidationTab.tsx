import { ListChecks } from "lucide-react";
import { typeLabel, type FieldItem } from "@/lib/fields";

// Validation — a read-only, aggregated view of every field's real
// validation rules (required/unique/charcount, same JSON the field editor
// and content form already enforce). Nothing new is stored here; this is a
// projection, same spirit as the Documentation tab's generated contract.
export default function ValidationTab({ fields }: { fields: FieldItem[] }) {
  const withRules = fields.filter(
    (f) => f.validations?.required?.status || f.validations?.unique?.status || f.validations?.charcount?.status,
  );

  return (
    <section className="surface-standard rounded-2xl">
      <header className="border-b border-white/[0.07] px-5 py-4">
        <h2 className="text-sm font-medium text-[#f2f3fb]">Validation</h2>
        <p className="mt-0.5 text-[11px] text-[#7680a3]">
          Every field&apos;s active validation rules, in one place
        </p>
      </header>

      {withRules.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <ListChecks className="h-8 w-8 text-[#4a5178]" aria-hidden="true" />
          <p className="text-sm text-[#b8bfd8]">No validation rules configured yet.</p>
          <p className="text-xs text-[#7680a3]">
            Add Required, Unique, or length/range rules from a field&apos;s edit form.
          </p>
        </div>
      ) : (
        <ul>
          {withRules.map((field) => {
            const charcount = field.validations?.charcount;
            const rules: string[] = [];
            if (field.validations?.required?.status) rules.push("Required");
            if (field.validations?.unique?.status) rules.push("Unique");
            if (charcount?.status) {
              const unit = field.type === "number" ? "" : " chars";
              if (charcount.type === "Between" && charcount.min != null && charcount.max != null) {
                rules.push(`Between ${charcount.min}–${charcount.max}${unit}`);
              } else if (charcount.type === "Min" && charcount.min != null) {
                rules.push(`Min ${charcount.min}${unit}`);
              } else if (charcount.type === "Max" && charcount.max != null) {
                rules.push(`Max ${charcount.max}${unit}`);
              }
            }

            return (
              <li
                key={field.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-[#f2f3fb]">{field.label}</p>
                  <p className="font-mono-code text-[11px] text-[#7680a3]">
                    {field.name} · {typeLabel(field.type)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rules.map((rule) => (
                    <span
                      key={rule}
                      className="rounded border border-[rgba(77,163,255,0.25)] bg-[rgba(69,49,224,0.14)] px-1.5 py-0.5 font-mono-code text-[10px] text-[#4da3ff]"
                    >
                      {rule}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
