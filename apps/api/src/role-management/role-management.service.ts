import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { USER_MODEL_TYPE } from '../authz/roles.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §5.3, §8 step 5 — the first UI-facing
// piece of role management this stack has ever had; every prior mention
// of "no UI or API to grant a role" (identity doc §2/§3.5, this doc's
// §5.3) meant that role assignment only ever happened through the legacy
// Laravel admin. This closes that gap for project-level roles specifically
// (admin/editor/developer/viewer) using the SAME model_has_roles mechanism
// RolesService already reads (§11) — deliberately not Keycloak's Admin
// REST API, since no Keycloak claims wiring for these roles exists yet
// (that's §8 step 4, not done). Department/Tenant Admin assignment is a
// natural, structurally-identical follow-up, not built in this pass.
export type ProjectRoleKind = 'admin' | 'editor' | 'developer' | 'viewer';
const PROJECT_ROLE_KINDS: ProjectRoleKind[] = ['admin', 'editor', 'developer', 'viewer'];

// docs/RBAC-TENANT-RECOMMENDATION.md §11.1/§11.2's flagged display gap:
// this list only ever showed DIRECT admin{id}/editor{id}/... grants, even
// though a Department/Tenant Admin has real, working access to every
// project in their scope (RolesService.getUserRoles' adminProjectIds
// expansion, §11.2) — they just never appeared here unless they ALSO held
// a direct project role. 'direct' is an actual admin{id}/editor{id}/...
// row in model_has_roles for this exact project; 'department_admin'/
// 'tenant_admin' are reached only through that expansion, surfaced here
// so this table finally reflects who can actually open this project, not
// just who was granted a role on it directly.
export type MemberSource = 'direct' | 'department_admin' | 'tenant_admin';

export interface ProjectMember {
  userId: number;
  name: string;
  email: string;
  roleKind: ProjectRoleKind;
  source: MemberSource;
}

function assertValidRoleKind(roleKind: string): asserts roleKind is ProjectRoleKind {
  if (!PROJECT_ROLE_KINDS.includes(roleKind as ProjectRoleKind)) {
    throw new BadRequestException(`roleKind must be one of: ${PROJECT_ROLE_KINDS.join(', ')}`);
  }
}

@Injectable()
export class RoleManagementService {
  constructor(private readonly prisma: PrismaService) {}

  private async listDirectMembers(projectId: number): Promise<ProjectMember[]> {
    const roleNames = PROJECT_ROLE_KINDS.map((kind) => `${kind}${projectId}`);
    const assignments = await this.prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, role: { name: { in: roleNames }, guardName: 'web' } },
      include: { role: true },
    });
    if (assignments.length === 0) return [];

    const userIds = [...new Set(assignments.map((a) => a.modelId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    const usersById = new Map(users.map((u) => [u.id, u]));

    const members: ProjectMember[] = [];
    for (const a of assignments) {
      const user = usersById.get(a.modelId);
      const roleKind = PROJECT_ROLE_KINDS.find((kind) => a.role.name === `${kind}${projectId}`);
      if (user && roleKind) {
        members.push({ userId: user.id, name: user.name, email: user.email, roleKind, source: 'direct' });
      }
    }
    return members;
  }

  // Every holder of a single role name (e.g. `department_admin3`,
  // `tenant_admin1`), resolved to real users the same way listDirectMembers
  // does for a whole tier's worth of role names at once.
  private async listRoleHolders(roleName: string): Promise<{ userId: number; name: string; email: string }[]> {
    const assignments = await this.prisma.modelHasRole.findMany({
      where: { modelType: USER_MODEL_TYPE, role: { name: roleName, guardName: 'web' } },
    });
    if (assignments.length === 0) return [];

    const userIds = [...new Set(assignments.map((a) => a.modelId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    return users.map((u) => ({ userId: u.id, name: u.name, email: u.email }));
  }

  async listProjectMembers(projectId: number): Promise<ProjectMember[]> {
    const [direct, project] = await Promise.all([
      this.listDirectMembers(projectId),
      this.prisma.project.findUnique({ where: { id: projectId }, include: { department: true } }),
    ]);

    // Inherited rows: a Department/Tenant Admin whose access to this
    // project comes only from RolesService.getUserRoles' adminProjectIds
    // expansion (§11.2) — never a role held directly on this project.
    // Effective tier is always 'admin' (that expansion only ever feeds
    // adminProjectIds, never editor/developer/viewer), so these always
    // render as an Admin-tier row, distinguished by `source` instead.
    const inheritedByUser = new Map<number, ProjectMember>();
    const sourceRank: Record<Exclude<MemberSource, 'direct'>, number> = {
      department_admin: 0,
      tenant_admin: 1, // wins when a user holds both, per listRoleHolders below
    };

    const addInherited = (
      holders: { userId: number; name: string; email: string }[],
      source: Exclude<MemberSource, 'direct'>,
    ) => {
      for (const h of holders) {
        const existing = inheritedByUser.get(h.userId);
        if (!existing || sourceRank[source] > sourceRank[existing.source as Exclude<MemberSource, 'direct'>]) {
          inheritedByUser.set(h.userId, { userId: h.userId, name: h.name, email: h.email, roleKind: 'admin', source });
        }
      }
    };

    const departmentId = project?.department?.id;
    const tenantId = project?.department?.tenantId ?? undefined;
    const [deptAdmins, tenantAdmins] = await Promise.all([
      departmentId ? this.listRoleHolders(`department_admin${departmentId}`) : Promise.resolve([]),
      tenantId ? this.listRoleHolders(`tenant_admin${tenantId}`) : Promise.resolve([]),
    ]);
    addInherited(deptAdmins, 'department_admin');
    addInherited(tenantAdmins, 'tenant_admin');

    // Don't show an inherited Admin row for someone who already has a
    // DIRECT admin{id} grant on this exact project — that would just be
    // the same person, same effective tier, listed twice for no reason.
    // A direct Editor/Developer/Viewer grant is a genuinely different,
    // narrower scoped grant than their inherited Admin access though (see
    // §5.7's "one user, multiple roles across scopes at once"), so THAT
    // stays as its own separate row alongside the inherited one.
    const directAdminUserIds = new Set(direct.filter((m) => m.roleKind === 'admin').map((m) => m.userId));
    const inherited = [...inheritedByUser.values()].filter((m) => !directAdminUserIds.has(m.userId));

    const members = [...direct, ...inherited];
    // Deterministic ordering for a UI table: by role tier, then name.
    const tierOrder: Record<ProjectRoleKind, number> = { admin: 0, editor: 1, developer: 2, viewer: 3 };
    return members.sort((a, b) => tierOrder[a.roleKind] - tierOrder[b.roleKind] || a.name.localeCompare(b.name));
  }

  // docs/RBAC-TENANT-RECOMMENDATION.md §11.13 flagged this as a real,
  // distinct, still-open question: this route requires members:manage,
  // which every Department Admin/Tenant Admin/Super Admin holds on
  // every project in their scope, but nothing stopped one of them from
  // granting a role to their OWN email. §11.15 closes the one part of
  // that which actually changes what the caller can do — see the
  // guard below, right where callerUserId is checked, for why only
  // 'admin' is restricted and editor/developer/viewer self-grants are
  // left alone.
  async assignProjectRole(
    projectId: number,
    callerUserId: number,
    email: string,
    roleKind: string,
  ): Promise<ProjectMember> {
    assertValidRoleKind(roleKind);

    // No invite/create-user flow here, matching this codebase's existing
    // caution around self-serve account creation (apps/web's /register
    // page keeps its submit disabled for the same reason) — this route
    // grants a role to an existing account, it doesn't create one.
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        `No user with email "${email}" — they need an existing account before a role can be granted`,
      );
    }

    // `admin{projectId}` is the ONE project role kind
    // RolesService.satisfiesRoleKind checks via a direct-grant-only path
    // (`directAdminProjectIds`, deliberately never the inherited
    // `adminProjectIds` superset a Department/Tenant Admin also gets) --
    // see that method's own comment for why. That makes 'admin' the
    // only role kind where granting it to yourself changes what you can
    // do: it lets you satisfy an 'admin'-tier approval-workflow step
    // (§6, §11.13) you wouldn't otherwise satisfy through inherited
    // Department/Tenant Admin access alone. Self-granting
    // editor/developer/viewer has no equivalent effect -- nothing in
    // this codebase checks those kinds via a direct-only path, so a
    // self-grant of one of those is at most redundant with access the
    // caller already has, never a new capability -- which is why only
    // 'admin' is restricted here rather than blocking self-grant
    // outright.
    if (roleKind === 'admin' && user.id === callerUserId) {
      throw new ForbiddenException(
        "You can't grant yourself the Admin role on a project — ask another Admin, "
          + 'Department Admin, Tenant Admin, or Super Admin to grant it.',
      );
    }

    const roleName = `${roleKind}${projectId}`;
    const role = await this.prisma.role.upsert({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
      update: {},
      create: { name: roleName, guardName: 'web' },
    });

    await this.prisma.modelHasRole.upsert({
      where: {
        roleId_modelId_modelType: { roleId: role.id, modelId: user.id, modelType: USER_MODEL_TYPE },
      },
      update: {},
      create: { roleId: role.id, modelId: user.id, modelType: USER_MODEL_TYPE },
    });

    return { userId: user.id, name: user.name, email: user.email, roleKind, source: 'direct' };
  }

  async revokeProjectRole(projectId: number, userId: number, roleKind: string): Promise<void> {
    assertValidRoleKind(roleKind);

    const roleName = `${roleKind}${projectId}`;
    const role = await this.prisma.role.findUnique({
      where: { name_guardName: { name: roleName, guardName: 'web' } },
    });
    if (!role) return; // nothing to revoke

    await this.prisma.modelHasRole.deleteMany({
      where: { roleId: role.id, modelId: userId, modelType: USER_MODEL_TYPE },
    });
  }
}
