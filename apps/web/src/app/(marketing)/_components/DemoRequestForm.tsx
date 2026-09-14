"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitDemoRequest, type DemoRequestInput } from "../demo-request-actions";

const INDUSTRIES = ["Insurance", "Banking", "Retail", "Healthcare", "Technology", "Travel", "Education", "Others"];
const ORG_SIZES = ["1-10", "11-50", "51-200", "200+"];

const initialState: DemoRequestInput = {
  fullname: "",
  businessemail: "",
  phoneno: "",
  "company-name": "",
  "job-title": "",
  industry: "",
  "organization-size": "",
  "interested-in": "",
  demopreference: "",
  "demo-time": "",
  "demo-date": "",
  country: "",
  "current-challenge": "",
  consent: false,
};

export function DemoRequestForm({ heading, subheading }: { heading: string; subheading: string }) {
  const [form, setForm] = useState<DemoRequestInput>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof DemoRequestInput>(key: K, value: DemoRequestInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitDemoRequest(form);
      if (result.ok) {
        setSuccess(true);
        setForm(initialState);
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  };

  if (success) {
    return (
      <div className="surface-feature flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-[#6cf0a4]" />
        <h3 className="text-xl font-semibold text-[var(--db-ink)]">Request received</h3>
        <p className="max-w-sm text-[14px] text-[var(--db-ink-muted)]">
          Thanks -- someone from the VeroXM team will reach out to schedule your walkthrough shortly.
        </p>
        <button type="button" onClick={() => setSuccess(false)} className="button-secondary mt-2 px-4 text-[12.5px]">
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="surface-feature rounded-2xl p-6 sm:p-8">
      <h3 className="text-xl font-semibold text-[var(--db-ink)]">{heading}</h3>
      <p className="mt-2 text-[14px] text-[var(--db-ink-muted)]">{subheading}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <input required minLength={2} maxLength={35} className="input-quiet px-3 py-2.5 text-[13.5px]" value={form.fullname} onChange={(e) => set("fullname", e.target.value)} />
        </Field>
        <Field label="Work email" required>
          <input required type="email" className="input-quiet px-3 py-2.5 text-[13.5px]" value={form.businessemail} onChange={(e) => set("businessemail", e.target.value)} />
        </Field>
        <Field label="Phone number" required>
          <input required type="tel" className="input-quiet px-3 py-2.5 text-[13.5px]" value={form.phoneno} onChange={(e) => set("phoneno", e.target.value)} />
        </Field>
        <Field label="Company name" required>
          <input required className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["company-name"]} onChange={(e) => set("company-name", e.target.value)} />
        </Field>
        <Field label="Job title">
          <input className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["job-title"]} onChange={(e) => set("job-title", e.target.value)} />
        </Field>
        <Field label="Country">
          <input className="input-quiet px-3 py-2.5 text-[13.5px]" value={form.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Industry">
          <select className="input-quiet px-3 py-2.5 text-[13.5px]" value={form.industry} onChange={(e) => set("industry", e.target.value)}>
            <option value="">Select...</option>
            {INDUSTRIES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Organization size">
          <select className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["organization-size"]} onChange={(e) => set("organization-size", e.target.value)}>
            <option value="">Select...</option>
            {ORG_SIZES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Preferred date" required>
          <input required type="date" className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["demo-date"]} onChange={(e) => set("demo-date", e.target.value)} />
        </Field>
        <Field label="Preferred time">
          <input type="time" className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["demo-time"]} onChange={(e) => set("demo-time", e.target.value)} />
        </Field>
        <Field label="What are you interested in?" full>
          <input className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["interested-in"]} onChange={(e) => set("interested-in", e.target.value)} placeholder="e.g. Headless CMS, personalization, migration" />
        </Field>
        <Field label="Current challenge" full>
          <textarea rows={3} className="input-quiet px-3 py-2.5 text-[13.5px]" value={form["current-challenge"]} onChange={(e) => set("current-challenge", e.target.value)} />
        </Field>
      </div>

      <label className="mt-5 flex items-start gap-2.5 text-[12.5px] text-[var(--db-ink-muted)]">
        <input
          required
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--db-hairline)] bg-[var(--db-surface-inset)]"
          checked={form.consent}
          onChange={(e) => set("consent", e.target.checked)}
        />
        I agree to be contacted by VeroXM about this request.
      </label>

      {error ? <p className="mt-4 text-[13px] text-[#ff8080]">{error}</p> : null}

      <button type="submit" disabled={isPending} className="button-primary motion-interactive mt-6 w-full px-5 text-[13px] sm:w-auto">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? "Submitting..." : "Request my demo"}
      </button>
    </form>
  );
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[12px] font-medium text-[var(--db-ink-muted)]">
        {label}
        {required ? <span className="text-[var(--db-sapphire-soft)]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
