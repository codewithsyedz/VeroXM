import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ArrowRight, Building2 } from "lucide-react";
import TenantAdminsPanel, { type TenantAdmin } from "./TenantAdminsPanel";
import TenantDetailsPanel from "./TenantDetailsPanel";

interface TenantDetail {
  id: number;
  name: string;
  slug: string;
  canManageAdmins: boolean;
  // §11.14
  canEditDetails: boolean;
  canDelete: boolean;
}

interface TenantDepartment {
  id: number;
  name: string;
  slug: string;
}

async function apiGet<T>(path: string, apiToken: string): Promise<T> {
  const res = await fetch(`${process.env.API_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Tenants API responded ${res.status} for ${path}`);
  }
  return res.json();
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.10 -- the Tenant-level
// counterpart to a Department's own detail page. Answers the two things
// this screen exists for: what Departments live in this Tenant, and who
// administers the Tenant itself.
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if (!session.apiToken) {
    redirect("/tenants");
  }

  const [tenant, departments, admins] = await Promise.all([
    apiGet<TenantDetail>(`/tenants/${tenantId}`, session.apiToken),
    apiGet<TenantDepartment[]>(`/tenants/${tenantId}/departments`, session.apiToken),
    apiGet<TenantAdmin[]>(`/tenants/${tenantId}/admins`, session.apiToken),
  ]);

  return (
    <div className="container py-12">
      <header className="border-b border-white/[0.08] pb-8">
        <p className="eyebrow">
          <Link href="/tenants" className="hover:text-[#b8bfd8]">
            Tenants
          </Link>
          {" / "}
          {tenant.name}
        </p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          {tenant.name}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#b8bfd8]">
          Every Department below belongs to this Tenant. Open one to manage its own projects and
          Department Admins.
        </p>
      </header>

      <div className="mt-8 max-w-3xl">
        <TenantDetailsPanel
          tenantId={tenantId}
          name={tenant.name}
          slug={tenant.slug}
          canEditDetails={tenant.canEditDetails}
          canDelete={tenant.canDelete}
        />
      </div>

      <div className="mt-8">
        <p className="eyebrow">Organization</p>
        <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Departments in this tenant</h2>

        {departments.length === 0 ? (
          <p className="mt-4 text-sm text-[#b8bfd8]">No departments assigned to this tenant yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((dept) => (
              <Link
                key={dept.id}
                href={`/departments/${dept.id}`}
                className="surface-standard group flex items-center justify-between gap-3 rounded-xl p-4 transition-colors hover:border-white/[0.16]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Building2 className="h-4 w-4 shrink-0 text-[#7680a3]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#f2f3fb]">{dept.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#7680a3]">{dept.slug}</p>
                  </div>
                </div>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-[#4da3ff] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 max-w-3xl">
        <TenantAdminsPanel tenantId={tenantId} initialAdmins={admins} canManage={tenant.canManageAdmins} />
      </div>
    </div>
  );
}
