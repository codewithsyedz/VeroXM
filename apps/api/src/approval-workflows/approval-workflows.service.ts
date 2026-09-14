import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mycms/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService, type UserRoles } from '../authz/roles.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §6, §8 step 6 — Department-level
// approval-workflow configuration (§6.3: Department is the recommended
// first-slice configuration point; a Project-level override is an
// explicitly deferred fast-follow, not built here). This module owns
// CONFIGURING a workflow; ACTING on one (submit/approve/reject a piece
// of content) lives in ContentService, next to publish()/unpublish(),
// the same split the doc draws between "who configures workflows" and
// "who acts within one."
export const APPROVAL_ROLE_KINDS = ['admin', 'department_admin', 'tenant_admin'] as const;
export type ApprovalRoleKind = (typeof APPROVAL_ROLE_KINDS)[number];

function assertValidRoleKind(kind: string): asserts kind is ApprovalRoleKind {
  if (!APPROVAL_ROLE_KINDS.includes(kind as ApprovalRoleKind)) {
    throw new BadRequestException(`requiredRoleKind must be one of: ${APPROVAL_ROLE_KINDS.join(', ')}`);
  }
}

export interface ApprovalStepDto {
  stepOrder: number;
  requiredRoleKind: ApprovalRoleKind;
}

export interface ApprovalWorkflowDto {
  id: number;
  departmentId: number;
  name: string;
  steps: ApprovalStepDto[];
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.6 — a Project-level override of
// its Department's workflow (§6.3's own flagged fast-follow). Same shape,
// different scope key; kept as a separate type rather than making
// departmentId/projectId both optional on one DTO, so a caller can't
// accidentally treat a project override as a department workflow (or
// vice versa) without the type system noticing.
export interface ProjectApprovalWorkflowDto {
  id: number;
  projectId: number;
  name: string;
  steps: ApprovalStepDto[];
}

// docs/RBAC-TENANT-RECOMMENDATION.md §11.13 -- unlike the Department-level
// workflow, whose canView/canConfigure split has no reason to reach the
// frontend (that page is only ever loaded by someone who already passed
// canView, and DepartmentDetail's own canManageAdmins flag already tells it
// who may configure), the project-level override's GET has to be able to
// say "yes, visible" and "no, not editable" at once -- a Department Admin
// can see this override but, after the §11.13 fix, can no longer touch it.
// A bare ProjectApprovalWorkflowDto (or null, when no override exists) can't
// carry that second bit, so GET returns this small envelope instead.
export interface ProjectApprovalWorkflowResult {
  canManage: boolean;
  workflow: ProjectApprovalWorkflowDto | null;
}

@Injectable()
export class ApprovalWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  // Same view-access rule as DepartmentsService.canView (duplicated
  // rather than shared across modules, matching this codebase's existing
  // preference for small per-module checks over a shared authz helper
  // class per feature) — Super Admin, the Tenant Admin of this
  // Department's Tenant, or a Department Admin of this exact Department.
  private canView(roles: UserRoles, department: { id: number; tenantId: number | null }): boolean {
    if (roles.isSuperAdmin) return true;
    if (department.tenantId && roles.tenantAdminTenantIds.includes(department.tenantId)) return true;
    return roles.departmentAdminDepartmentIds.includes(department.id);
  }

  // Only a Tenant Admin (or Super Admin) may CONFIGURE a workflow — same
  // restriction, and the same reasoning, as DepartmentsService.
  // canManageAdmins: a Department Admin shouldn't be able to loosen or
  // remove the approval gate governing their own department.
  private canConfigure(roles: UserRoles, department: { tenantId: number | null }): boolean {
    if (roles.isSuperAdmin) return true;
    return !!department.tenantId && roles.tenantAdminTenantIds.includes(department.tenantId);
  }

  private async requireDepartment(departmentId: number) {
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException(`No department with id ${departmentId}`);
    return department;
  }

  async getWorkflow(userId: number, departmentId: number): Promise<ApprovalWorkflowDto | null> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canView(roles, department)) {
      throw new ForbiddenException(`No access to department ${departmentId}`);
    }

    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { departmentId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!workflow) return null;

    return {
      id: workflow.id,
      departmentId: workflow.departmentId!,
      name: workflow.name,
      steps: workflow.steps.map((s) => ({
        stepOrder: s.stepOrder,
        requiredRoleKind: s.requiredRoleKind as ApprovalRoleKind,
      })),
    };
  }

  // Full replace, not incremental step CRUD — "configurable" here means
  // "define the ordered list," not "patch step 3." Re-creates the
  // workflow row if none exists yet (a Department's first-ever workflow),
  // otherwise updates its steps in place. `name` is currently fixed —
  // there's exactly one workflow per Department, so nothing needs to
  // disambiguate it from another yet.
  async setSteps(userId: number, departmentId: number, steps: { requiredRoleKind: string }[]): Promise<ApprovalWorkflowDto> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canConfigure(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin (or Super Admin) can configure the approval workflow for department ${departmentId}`,
      );
    }

    if (steps.length === 0) {
      throw new BadRequestException(
        'A workflow needs at least one step — to remove approval entirely, delete the workflow instead',
      );
    }
    steps.forEach((s) => assertValidRoleKind(s.requiredRoleKind));

    const workflow = await this.prisma.approvalWorkflow.upsert({
      where: { departmentId },
      update: {},
      create: { departmentId },
    });

    await this.prisma.$transaction([
      this.prisma.approvalStep.deleteMany({ where: { workflowId: workflow.id } }),
      this.prisma.approvalStep.createMany({
        data: steps.map((s, index) => ({
          workflowId: workflow.id,
          stepOrder: index + 1,
          requiredRoleKind: s.requiredRoleKind,
        })),
      }),
    ]);

    return this.getWorkflow(userId, departmentId) as Promise<ApprovalWorkflowDto>;
  }

  // A workflow with existing ContentApprovalRequests can't be hard-deleted
  // (content_approval_requests.workflow_id has no ON DELETE CASCADE, on
  // purpose — see the SQL migration's comment: approval history outlives
  // the workflow that produced it). That FK RESTRICT surfaces here as a
  // clear, expected error rather than removal silently orphaning history.
  async removeWorkflow(userId: number, departmentId: number): Promise<void> {
    const department = await this.requireDepartment(departmentId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canConfigure(roles, department)) {
      throw new ForbiddenException(
        `Only a Tenant Admin (or Super Admin) can remove the approval workflow for department ${departmentId}`,
      );
    }

    const workflow = await this.prisma.approvalWorkflow.findUnique({ where: { departmentId } });
    if (!workflow) return; // nothing to remove

    try {
      await this.prisma.approvalWorkflow.delete({ where: { id: workflow.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'This workflow already has approval history and can’t be removed — edit its steps instead of deleting it',
        );
      }
      throw err;
    }
  }

  // --- §11.6: Project-level override ---
  //
  // Deliberately a WIDER configure rule than the Department-level
  // methods above: a Department Admin (not just Tenant Admin/Super Admin)
  // can configure their own project's override. View and configure are
  // the same set here — unlike the split above, there's no separate
  // "can see it but not touch it" tier for a project override, since it's
  // a narrower, project-scoped decision rather than department-wide
  // policy. A project with no Department at all has no such scope to
  // check against, so only Super Admin can see or configure its override.
  private async requireProject(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { department: true },
    });
    if (!project) throw new NotFoundException(`No project with id ${projectId}`);
    return project;
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.13 -- WHO MAY SEE the override,
  // deliberately still including Department Admin (unchanged from before the
  // §11.13 fix): they administer every project in this department and
  // should be able to tell why a publish is gated, even though (below) they
  // can no longer change it.
  private canViewProjectOverride(
    roles: UserRoles,
    project: { department: { id: number; tenantId: number | null } | null },
  ): boolean {
    if (roles.isSuperAdmin) return true;
    if (!project.department) return false;
    if (project.department.tenantId && roles.tenantAdminTenantIds.includes(project.department.tenantId)) {
      return true;
    }
    return roles.departmentAdminDepartmentIds.includes(project.department.id);
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.13 -- WHO MAY CONFIGURE the
  // override: Tenant Admin (of this project's department's tenant) or Super
  // Admin only, matching canConfigure's department-level restriction exactly
  // and for the identical reason (that method's own comment): a Department
  // Admin shouldn't be able to loosen or remove the approval gate governing
  // their own department -- and a project-level override that fully replaces
  // the department's workflow is just as much "the gate governing their own
  // department" as the department-level workflow itself is. Before this fix,
  // this method was the SAME method as canViewProjectOverride above, which
  // let a Department Admin reopen exactly the loophole canConfigure was
  // written to close: set this project's override to a single `admin` step,
  // grant themselves a direct admin{projectId} role via their own
  // members:manage permission (POST /projects/:projectId/members has no
  // self-grant restriction), and self-approve -- fully bypassing whatever
  // stricter workflow a Tenant Admin had configured for their department.
  // Found by an adversarial security review, confirmed exploitable, fixed
  // here rather than left as a documented risk.
  private canManageProjectOverride(
    roles: UserRoles,
    project: { department: { id: number; tenantId: number | null } | null },
  ): boolean {
    if (roles.isSuperAdmin) return true;
    if (!project.department?.tenantId) return false;
    return roles.tenantAdminTenantIds.includes(project.department.tenantId);
  }

  async getProjectWorkflow(userId: number, projectId: number): Promise<ProjectApprovalWorkflowResult> {
    const project = await this.requireProject(projectId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canViewProjectOverride(roles, project)) {
      throw new ForbiddenException(`No access to project ${projectId}`);
    }
    const canManage = this.canManageProjectOverride(roles, project);

    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { projectId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!workflow) return { canManage, workflow: null };

    return {
      canManage,
      workflow: {
        id: workflow.id,
        // Invariant enforced by setProjectSteps below: a row reachable via
        // `where: { projectId }` was only ever created with a projectId set.
        projectId: workflow.projectId!,
        name: workflow.name,
        steps: workflow.steps.map((s) => ({
          stepOrder: s.stepOrder,
          requiredRoleKind: s.requiredRoleKind as ApprovalRoleKind,
        })),
      },
    };
  }

  // Same "full replace, not incremental step CRUD" contract as setSteps
  // above. `create: { projectId }` deliberately leaves departmentId unset
  // (null) — this row is project-scoped, never both.
  async setProjectSteps(
    userId: number,
    projectId: number,
    steps: { requiredRoleKind: string }[],
  ): Promise<ProjectApprovalWorkflowDto> {
    const project = await this.requireProject(projectId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canManageProjectOverride(roles, project)) {
      throw new ForbiddenException(
        `Only a Tenant Admin (or Super Admin) can configure project ${projectId}'s approval-workflow override`,
      );
    }

    if (steps.length === 0) {
      throw new BadRequestException(
        'A workflow needs at least one step — to remove the override, delete it instead',
      );
    }
    steps.forEach((s) => assertValidRoleKind(s.requiredRoleKind));

    const workflow = await this.prisma.approvalWorkflow.upsert({
      where: { projectId },
      update: {},
      create: { projectId },
    });

    await this.prisma.$transaction([
      this.prisma.approvalStep.deleteMany({ where: { workflowId: workflow.id } }),
      this.prisma.approvalStep.createMany({
        data: steps.map((s, index) => ({
          workflowId: workflow.id,
          stepOrder: index + 1,
          requiredRoleKind: s.requiredRoleKind,
        })),
      }),
    ]);

    // Built directly rather than round-tripping through getProjectWorkflow --
    // that method now returns the {canManage, workflow} envelope, and the
    // caller here already knows canManage is true (they just passed the check
    // above), so there's nothing that second shape would add.
    return {
      id: workflow.id,
      projectId: workflow.projectId!,
      name: workflow.name,
      steps: steps.map((s, index) => ({
        stepOrder: index + 1,
        requiredRoleKind: s.requiredRoleKind as ApprovalRoleKind,
      })),
    };
  }

  // Same FK-RESTRICT-surfaces-as-ConflictException contract as
  // removeWorkflow above — a project override with existing approval
  // history can't be hard-deleted either.
  async removeProjectWorkflow(userId: number, projectId: number): Promise<void> {
    const project = await this.requireProject(projectId);
    const roles = await this.rolesService.getUserRoles(userId);
    if (!this.canManageProjectOverride(roles, project)) {
      throw new ForbiddenException(
        `Only a Tenant Admin (or Super Admin) can remove project ${projectId}'s approval-workflow override`,
      );
    }

    const workflow = await this.prisma.approvalWorkflow.findUnique({ where: { projectId } });
    if (!workflow) return; // nothing to remove

    try {
      await this.prisma.approvalWorkflow.delete({ where: { id: workflow.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'This override already has approval history and can’t be removed — edit its steps instead of deleting it',
        );
      }
      throw err;
    }
  }
}
