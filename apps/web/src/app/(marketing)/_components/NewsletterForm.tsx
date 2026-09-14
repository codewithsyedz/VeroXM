"use client";

export function NewsletterForm({ placeholder }: { placeholder: string }) {
  return (
    <form className="mt-4 flex max-w-xs gap-2" onSubmit={(e) => e.preventDefault()}>
      <input type="email" required placeholder={placeholder} className="input-quiet px-3 py-2 text-[13px]" />
      <button type="submit" className="button-secondary px-3 text-[12px]">Join</button>
    </form>
  );
}
