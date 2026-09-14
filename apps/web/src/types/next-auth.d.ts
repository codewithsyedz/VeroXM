import type { DefaultSession } from "next-auth";

// docs/RBAC-TENANT-RECOMMENDATION.md §7, §8 step 7: the impersonation
// overlay pushed into the session by useSession().update({ impersonating })
// right after a successful POST /impersonation/start (see
// apps/web/.../impersonation-actions.ts) and read back out by
// apps/web/src/lib/auth.ts's jwt/session callbacks. `userId`/`auditLogId`
// are strings/numbers respectively to match how token.userId (a legacy
// user id) and the audit-log row id are already typed elsewhere in this
// file.
export interface ImpersonationState {
  userId: string;
  email: string;
  name?: string | null;
  auditLogId: number;
}

declare module "next-auth" {
  interface Session {
    apiToken?: string;
    impersonating?: ImpersonationState | null;
    user?: {
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    apiToken?: string;
    impersonating?: ImpersonationState;
  }
}
