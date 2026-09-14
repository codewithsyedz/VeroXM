import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ArrowRight, FolderOpen } from "lucide-react";
import DepartmentAdminsPanel, { type DepartmentAdmin } from "./DepartmentAdminsPanel";
import ApprovalWorkflowPanel, { type ApprovalWorkflowConfig } from "./ApprovalWorkflowPanel";
import CustomRolesPanel, { type CustomRoleSummary } from "./CustomRolesPanel";

interface DepartmentDetail {
  id: number;
  name: string;
  slug: string;
  tenantId: number | null;
  tenantName: string | null;
  canManageAdmins: boolean;
}

interface DepartmentProject {
  id: number;
  uuid: string;
  name: string;
  slug: string | null;
  status: string;
}

async function apiGet<T>(path: string, apiToken: string): Promise<T> {
  const res = await fetch(`${process.env.API_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Departments API responded ${res.status} for ${path}`);
  }
  // approval-workflow (and, in principle, any of these) can legitimately
  // respond with an empty body for a null result (e.g. no workflow
  // configured yet) — matching the res.status === 204 guard
  // ../[projectId]/members/actions.ts's apiFetch already uses, but keyed
  // off actual body content rather than assuming 204 specifically, since
  // this app's own NestJS controllers don't consistently choose 204 vs.
  // 200-with-empty-body for a null return value.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// docs/RBAC-TENANT-RECOMMENDATION.md §5.5, §8 step 5 (follow-up) — the
// Department-level counterpart to a project's own Members page. Answers
// the two things the user actually asked for: what projects live in this
// department (nothing from any other department), and who administers
// the department itself.
export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const { departmentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  if (!session.apiToken) {
    redirect("/departments");
  }

  const [department, projects, admins, approvalWorkflow, customRoles] = await Promise.all([
    apiGet<DepartmentDetail>(`/departments/${departmentId}`, session.apiToken),
    apiGet<DepartmentProject[]>(`/departments/${departmentId}/projects`, session.apiToken),
    apiGet<DepartmentAdmin[]>(`/departments/${departmentId}/admins`, session.apiToken),
    apiGet<ApprovalWorkflowConfig | null>(`/departments/${departmentId}/approval-workflow`, session.apiToken),
    apiGet<CustomRoleSummary[]>(`/departments/${departmentId}/custom-roles`, session.apiToken),
  ]);

  return (
    <div className="container py-12">
      <header className="border-b border-white/[0.08] pb-8">
        <p className="eyebrow">
          <Link href="/departments" className="hover:text-[#b8bfd8]">
            Departments
          </Link>
          {" / "}
          {department.name}
        </p>
        <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
          {department.name}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#b8bfd8]">
          {department.tenantName ? `Part of ${department.tenantName}. ` : ""}
          Every project below belongs to this department — projects in other departments never
          appear here, and this department&apos;s admins never appear in theirs.
        </p>
      </header>

      <div className="mt-8">
        <p className="eyebrow">Content</p>
        <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Projects in this department</h2>

        {projects.length === 0 ? (
          <p className="mt-4 text-sm text-[#b8bfd8]">No projects assigned to this department yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}/members`}
                className="surface-standard group flex items-center justify-between gap-3 rounded-xl p-4 transition-colors hover:border-white/[0.16]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <FolderOpen className="h-4 w-4 shrink-0 text-[#7680a3]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#f2f3fb]">{project.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#7680a3]">
                      {project.slug ?? project.uuid}
                    </p>
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
        <DepartmentAdminsPanel
          departmentId={departmentId}
          initialAdmins={admins}
          canManage={department.canManageAdmins}
        />
      </div>

      <div className="mt-6 max-w-3xl">
        <ApprovalWorkflowPanel
          departmentId={departmentId}
          initialWorkflow={approvalWorkflow}
          canManage={department.canManageAdmins}
        />
      </div>

      {/* docs/RBAC-TENANT-RECOMMENDATION.md section 5.6 -- canManage here
          is unconditionally true, not department.canManageAdmins: reaching
          this page at all already requires DepartmentsService.canView,
          which is exactly what CustomRolesService.canConfigure also
          requires (Tenant Admin or Department Admin) -- unlike
          canManageAdmins, which is the stricter Tenant-Admin-only gate for
          granting Department Admin itself. See CustomRolesPanel's own
          comment. */}
      <div className="mt-6 max-w-3xl">
        <CustomRolesPanel departmentId={departmentId} initialRoles={customRoles} canManage={true} />
      </div>
    </div>
  );
}
