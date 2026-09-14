import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface NavProps {
  companyName: string;
  logoUrl: string | null;
  bookDemoLabel: string;
}

const links = [
  { href: "#features", label: "Product" },
  { href: "#cms", label: "Platform" },
  { href: "#advantages", label: "Teams" },
  { href: "#faqs", label: "FAQ" },
];

export function Nav({ companyName, logoUrl, bookDemoLabel }: NavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--db-hairline-quiet)] bg-[var(--db-background)]/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--db-ink)]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--db-sapphire)] text-[11px] font-bold text-white">V</span>
          )}
          {companyName}
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[13px] font-medium text-[var(--db-ink-muted)] transition-colors hover:text-[var(--db-ink)]">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-[13px] font-medium text-[var(--db-ink-muted)] transition-colors hover:text-[var(--db-ink)] sm:inline-block">
            Sign in
          </Link>
          <a href="#book-a-demo" className="button-primary motion-interactive px-4 text-[12.5px]">
            {bookDemoLabel} <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
