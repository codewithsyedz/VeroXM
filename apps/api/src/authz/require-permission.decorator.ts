import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §5.2, §8 step 2 — additive alongside
// RequireProjectRole/PROJECT_ROLE_KEY, not a replacement. A route opts
// into permission-based checking by using this decorator instead of (or,
// during migration, alongside) @RequireProjectRole.
export const REQUIRE_PERMISSION_KEY = 'required_permission';

export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
