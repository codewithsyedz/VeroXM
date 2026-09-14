import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ArrowRight, Landmark } from "lucide-react";
import CreateTenantPanel from "./CreateTenantPanel";

interface TenantSummary {
  id: number;
  name: string;
  slug: string;
}

// §11.14 -- a bare TenantSummary[] can't also carry canCreate; see
// TenantsService.TenantsListResult for why.
interface TenantsListResult {
  canCreate: boolean;
  tenants: TenantSummary[];
}

async function getTenants(apiToken: string): Promise<TenantsListResult> {
  const res = await fetch(`${process.env.API_URL}/tenants`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Tenants API responded ${res.status}`);
  }
  return res.json();
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.10 -- entry point for the
// Tenant-level management screen. Only ever shows Tenants the signed-in
// user administers (or every Tenant, for a Super Admin) -- TenantsService
// enforces that server-side, this page just renders whatever it returns.
// Mirrors ../departments/page.tsx's shape exactly, one tier up.
export default async function TenantsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const { canCreate, tenants } = session.apiToken
    ? await getTenants(session.apiToken)
    : { canCreate: false, tenants: [] };

  return (
    <div className="container py-12">
      <header className="border-b border-white/[0.08] pb-8">
        <p className="eyebrow">Organization</p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          Tenants
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#b8bfd8]">
          Each Tenant is the top-level boundary above Departments. Open a Tenant to see its
          Departments and manage who administers it.
        </p>
      </header>

      {canCreate && (
        <div className="mt-8">
          <CreateTenantPanel />
        </div>
      )}

      {tenants.length === 0 ? (
        <p className="mt-8 text-sm text-[#b8bfd8]">
          No Tenants to show — you don&apos;t hold a Tenant Admin role on any Tenant yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant) => (
            <Link
              key={tenant.id}
              href={`/tenants/${tenant.id}`}
              className="surface-standard group flex flex-col justify-between rounded-2xl p-6 transition-colors hover:border-white/[0.16]"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <Landmark className="h-4 w-4 text-[#7680a3]" aria-hidden="true" />
                  <p className="text-[15px] font-medium text-[#f2f3fb]">{tenant.name}</p>
                </div>
                <p className="mt-2 text-xs font-mono-code text-[#7680a3]">{tenant.slug}</p>
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-xs font-medium text-[#4da3ff]">
                <span>Manage tenant</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
