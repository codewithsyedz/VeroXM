// docs/RBAC-TENANT-RECOMMENDATION.md §5.1, §5.4, §5.5, §8 step 2.
//
// The permission catalog and default role-kind -> permission-set bundles
// from the recommendation doc's §5.4 table, made concrete. This is a
// static, in-code mapping deliberately, not a live `role_has_permissions`
// pivot read at request time: the legacy schema already has dormant
// `permissions`/`model_has_permissions`/`role_has_permissions` tables
// (see the comment above the `Role` model in packages/db/prisma/schema.prisma),
// but nothing populates them for the five default roles today, and the
// legacy admin is still the only place a role gets created at all. A
// live, admin-configurable permission catalog is the right foundation for
// custom/composable roles (§5.6) — deliberately deferred, not built here.
//
// RoleKind intentionally includes 'admin', the existing project-level
// tier (`admin{projectId}` in model_has_roles), even though it isn't one
// of the mockup's five named roles — it has to keep meaning something
// under the new permission model too, since ProjectRoleGuard/RolesService
// still serve it unchanged (§5.2).

export type Permission =
  | 'content:read'
  | 'content:write'
  | 'content:approve'
  | 'content:publish'
  | 'api-tokens:manage'
  | 'members:manage'
  | 'workflow:configure'
  | 'roles:configure'
  | 'department:manage'
  | 'tenant:manage'
  | 'impersonate:user';

export type RoleKind =
  | 'super_admin'
  | 'tenant_admin'
  | 'department_admin'
  | 'admin'
  | 'editor'
  | 'developer'
  | 'viewer';

const ALL_PERMISSIONS: Permission[] = [
  'content:read',
  'content:write',
  'content:approve',
  'content:publish',
  'api-tokens:manage',
  'members:manage',
  'workflow:configure',
  'roles:configure',
  'department:manage',
  'tenant:manage',
  'impersonate:user',
];

// §5.4's table, as data. Tenant Admin and Department Admin (§5.5) share
// the same bundle except for department:manage/tenant:manage — the
// *scope* each permission applies at (one Tenant vs. one Department vs.
// one Project) is applied by RolesService.getPermissionsForProject, not
// encoded here.
export const ROLE_PERMISSIONS: Record<RoleKind, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  tenant_admin: [
    'content:read',
    'content:write',
    'content:approve',
    'content:publish',
    'api-tokens:manage',
    'members:manage',
    'workflow:configure',
    'roles:configure',
    'department:manage',
    'impersonate:user',
  ],
  department_admin: [
    'content:read',
    'content:write',
    'content:approve',
    'content:publish',
    'api-tokens:manage',
    'members:manage',
    'workflow:configure',
    'roles:configure',
  ],
  admin: ['content:read', 'content:write', 'content:approve', 'content:publish', 'api-tokens:manage'],
  editor: ['content:read', 'content:write', 'content:publish'],
  developer: ['content:read', 'api-tokens:manage'],
  viewer: ['content:read'],
};

// docs/RBAC-TENANT-RECOMMENDATION.md section 5.6 -- a custom role's
// permission checklist is deliberately a NARROWER list than the full
// Permission catalog above: composing a custom role out of
// tenant:manage/department:manage/roles:configure/impersonate:user/
// workflow:configure would let whoever can configure custom roles
// (Tenant Admin, Department Admin -- see CustomRolesService.canConfigure)
// mint themselves or anyone else an equivalent-or-greater-privileged
// role without ever holding tenant_admin{id}/department_admin{id}
// directly -- a privilege-escalation path the fixed role hierarchy
// doesn't otherwise have. The doc's own motivating example (a "Content
// Approver" who holds content:approve/content:read without
// content:write or members:manage) only ever needs the permissions
// below, so this is what CustomRolesService actually validates against
// and what the frontend checklist offers.
export const CUSTOM_ROLE_ASSIGNABLE_PERMISSIONS: Permission[] = [
  'content:read',
  'content:write',
  'content:approve',
  'content:publish',
  'api-tokens:manage',
];
