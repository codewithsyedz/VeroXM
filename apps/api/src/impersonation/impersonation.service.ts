import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../authz/roles.service.js';

export interface ImpersonationStart {
  auditLogId: number;
  userId: number;
  name: string;
  email: string;
}

// docs/RBAC-TENANT-RECOMMENDATION.md §7, §8 step 7 -- the "app-level
// impersonation token" mechanism (chosen over true Keycloak SSO
// impersonation/Token Exchange, which would need new NextAuth plumbing
// this app's session model doesn't have -- see the design note in
// apps/web/src/lib/auth.ts). This service does exactly two things: decide
// whether the actor may impersonate the target, and keep the audit trail.
// It deliberately does NOT mint any token -- that stays where
// session.apiToken is already minted today, in NextAuth's own `jwt`
// callback -- this only hands that callback the target identity to sign
// for, after re-validating authorization itself server-side (the caller,
// a Next.js server action, cannot be trusted to have checked this).
@Injectable()
export class ImpersonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  async start(actorId: number, targetUserId: number, reason?: string): Promise<ImpersonationStart> {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException(`No user with id ${targetUserId}`);
    }

    const { allowed } = await this.rolesService.canImpersonate(actorId, targetUserId);
    if (!allowed) {
      throw new ForbiddenException('Not authorized to impersonate this user');
    }

    const log = await this.prisma.impersonationAuditLog.create({
      data: { actorId, targetUserId, reason: reason?.trim() || null },
    });

    return { auditLogId: log.id, userId: target.id, name: target.name, email: target.email };
  }

  // Scoped to a row the SAME actor started -- an actor can only end their
  // own impersonation session, never stamp ended_at on someone else's.
  // Silently no-ops on an unknown id or one already ended, rather than
  // erroring: the frontend calls this best-effort alongside clearing its
  // own local session overlay (see TopNav.tsx), and a stale/already-closed
  // audit row shouldn't block a user from getting back to their own
  // identity.
  async end(actorId: number, auditLogId: number): Promise<void> {
    const log = await this.prisma.impersonationAuditLog.findUnique({ where: { id: auditLogId } });
    if (!log || log.actorId !== actorId || log.endedAt) return;

    await this.prisma.impersonationAuditLog.update({
      where: { id: auditLogId },
      data: { endedAt: new Date() },
    });
  }
}
