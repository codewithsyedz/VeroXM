import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TopNav from "./TopNav";
import Footer from "./Footer";

// Dashboard route group: the working admin surface (Projects, Collections,
// Content, Media, Access). Uses the "Obsidian Atelier" design language (see
// docs — ported from the sibling veroxm-obsidian-atelier reference
// project), scoped to `.dashboard-theme` in globals.css so it never
// affects the (marketing) route group, which keeps its own separate,
// still-unbuilt design pass.
//
// Navigation is a single merged header (TopNav) rather than TopNav plus a
// separate project-section band — the two were folded into one bar per a
// later design pass; see TopNav.tsx's own comment for what that changed.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <div className="dashboard-theme flex min-h-full flex-col">
      <TopNav userEmail={session?.user?.email} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
