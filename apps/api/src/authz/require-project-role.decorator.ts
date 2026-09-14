import { SetMetadata } from '@nestjs/common';

export const PROJECT_ROLE_KEY = 'project_role_tier';

// The legacy app's three tiers, ported as-is (see docs/PHASE-6-NOTES.md
// for the full audit of which legacy method requires which tier), plus
// one new tier this pass added:
//   'viewer' — admin{projectId} OR editor{projectId} OR developer{projectId}
//              OR viewer{projectId} OR super_admin. Any project-scoped
//              role at all — "can see this project and its content."
//              Developer/Viewer role kinds existed in RolesService since
//              §8 step 2 but were never actually reachable through any
//              guard: every read route was still 'editor'-tier, which
//              only ever checked adminProjectIds/editorProjectIds. Use
//              this ONLY on genuinely read-only routes (GET list/detail,
//              approval status) — never on anything that writes, since
//              Viewer's permission bundle is content:read alone (see
//              authz/permissions.ts) and nothing downstream of these
//              routes re-checks a finer permission once the guard passes.
//   'editor' — admin{projectId} OR editor{projectId} OR super_admin
//   'admin'  — admin{projectId} OR super_admin (schema/project changes —
//              editors are excluded, e.g. Collections/Fields, and
//              Project rename)
//   'super_admin' — super_admin only (e.g. Project delete)
export type ProjectRoleTier = 'viewer' | 'editor' | 'admin' | 'super_admin';

export const RequireProjectRole = (tier: ProjectRoleTier) => SetMetadata(PROJECT_ROLE_KEY, tier);
