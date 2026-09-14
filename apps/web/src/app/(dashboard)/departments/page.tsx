import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ArrowRight, Building2 } from "lucide-react";

interface DepartmentSummary {
  id: number;
  name: string;
  slug: string;
  tenantId: number | null;
  tenantName: string | null;
}

async function getDepartments(apiToken: string): Promise<DepartmentSummary[]> {
  const res = await fetch(`${process.env.API_URL}/departments`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Departments API responded ${res.status}`);
  }
  return res.json();
}

// docs/RBAC-TENANT-RECOMMENDATION.md §5.5, §8 step 5 (follow-up) — entry
// point for the Department-level management screen. Only ever shows
// Departments the signed-in user is Tenant Admin or Department Admin
// over (or every Department, for a Super Admin) — DepartmentsService
// enforces that server-side, this page just renders whatever it returns.
export default async function DepartmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const departments = session.apiToken ? await getDepartments(session.apiToken) : [];

  return (
    <div className="container py-12">
      <header className="border-b border-white/[0.08] pb-8">
        <p className="eyebrow">Organization</p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          Departments
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#b8bfd8]">
          Each Department is its own boundary — its admins see every project inside it, and
          nothing outside it. Open a Department to manage its projects and admins.
        </p>
      </header>

      {departments.length === 0 ? (
        <p className="mt-8 text-sm text-[#b8bfd8]">
          No Departments to show — you don&apos;t hold a Tenant Admin or Department Admin role
          on any Department yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <Link
              key={dept.id}
              href={`/departments/${dept.id}`}
              className="surface-standard group flex flex-col justify-between rounded-2xl p-6 transition-colors hover:border-white/[0.16]"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                  <p className="text-[15px] font-medium text-[#f2f3fb]">{dept.name}</p>
                </div>
                <p className="mt-2 text-xs font-mono-code text-[#7680a3]">{dept.slug}</p>
                {dept.tenantName && (
                  <p className="mt-3 text-xs text-[#b8bfd8]">Tenant: {dept.tenantName}</p>
                )}
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-[#4da3ff]">
                <span>Manage department</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
