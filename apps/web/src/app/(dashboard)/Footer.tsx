import Image from "next/image";

// The footer bar from the design reference's admin screens. The reference's
// own right-hand links ("Design notes", "Principles", "Workspace status:
// normal") aren't carried over — the first two were pages of that prototype
// and the third was a hardcoded label with nothing behind it.
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-white/[0.07]">
      <div className="container flex flex-wrap items-center gap-3 py-6">
        <Image
          src="/brand/veroxm-mark-64.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7"
        />
        <span className="text-xs text-[#7680a3]">VeroXM · Content operating system</span>
      </div>
    </footer>
  );
}
