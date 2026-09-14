import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getProject } from "@/lib/get-project";
import MembersTable, { type ProjectMember } from "./MembersTable";
import ProjectApprovalWorkflowPanel, {
  type ProjectApprovalWorkflowConfig,
} from "./ProjectApprovalWorkflowPanel";

async function getMembers(projectId: string, apiToken: string): Promise<ProjectMember[]> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/members`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Members API responded ${res.status}`);
  }
  return res.json();
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.6 — unlike every other fetch on
// this page, this one must NOT throw on a non-OK response: most project
// members are plain Editors/Developers/Viewers, not Department
// Admin/Tenant Admin/Super Admin, so a 403 here is the ordinary case, not
// a failure — the Department page's apiGet-throws-on-!res.ok pattern
// doesn't apply, since that page is only ever reached by someone who
// already passed a DepartmentsService.canView check.
//
// Returns `undefined` for "not authorized to view/configure this
// project's override" (the panel is hidden entirely). Otherwise returns
// the API's own {canManage, workflow} envelope (§11.13) — `workflow: null`
// means "authorized to view, no override configured, so this project
// inherits its department's workflow"; `canManage: false` (a Department
// Admin, after §11.13) means the panel renders read-only rather than
// hidden entirely, since a Department Admin can still see why a publish
// is gated even though they can no longer change it.
async function getProjectApprovalWorkflow(
  projectId: string,
  apiToken: string,
): Promise<{ canManage: boolean; workflow: ProjectApprovalWorkflowConfig | null } | undefined> {
  const res = await fetch(`${process.env.API_URL}/projects/${projectId}/approval-workflow`, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    // 403 (no access) is expected for most viewers of this page; any
    // other failure also just hides this supplementary panel rather than
    // crashing the whole Members page over it.
    return undefined;
  }
  return res.json();
}

// docs/RBAC-TENANT-RECOMMENDATION.md §5.3, §8 step 5 — the first UI this
// stack has ever had for granting a role to a user (previously only
// possible through the legacy Laravel admin). Scoped to project-level
// roles (admin/editor/developer/viewer) for this pass; Department/Tenant
// Admin get their own screen later, once there's more than one real
// Tenant/Department to manage.
export default async function ProjectMembersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const [project, members, approvalWorkflow] = session.apiToken
    ? await Promise.all([
        getProject(projectId, session.apiToken),
        getMembers(projectId, session.apiToken),
        getProjectApprovalWorkflow(projectId, session.apiToken),
      ])
    : [null, [], undefined];

  return (
    <div className="container py-12">
      <header className="flex flex-col gap-6 border-b border-white/[0.08] pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">{project?.name ?? "Project settings"}</p>
          <h1 className="mt-3 text-[32px] font-medium tracking-tight text-[#f2f3fb] sm:text-[38px]">
            Members
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-[#b8bfd8]">
            Who has access to {project?.name ?? "this project"}, and at what level — Admin,
            Editor, Developer or Viewer.
          </p>
        </div>
      </header>

      <div className="mt-8 max-w-3xl">
        <MembersTable projectId={projectId} initialMembers={members} />
      </div>

      {approvalWorkflow !== undefined && (
        <div className="mt-6 max-w-3xl">
          <ProjectApprovalWorkflowPanel
            projectId={projectId}
            initialWorkflow={approvalWorkflow.workflow}
            canManage={approvalWorkflow.canManage}
          />
        </div>
      )}
    </div>
  );
}
