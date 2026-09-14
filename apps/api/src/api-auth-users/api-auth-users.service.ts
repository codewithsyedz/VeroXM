import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
// A default import, not `import * as bcrypt` -- bcryptjs's dist file is a
// UMD bundle that assigns its whole exports object dynamically
// (`module.exports = factory()`), which Node's ESM/CJS interop can't
// statically detect named exports from. `import * as ns` then only gets
// `ns.default` populated (the real module.exports), leaving `ns.hash`
// undefined; a default import binds directly to module.exports itself,
// where `.hash`/`.compare` actually live. Confirmed live: `import *` threw
// "bcrypt.hash is not a function" the moment this route was hit.
import bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';

// Matches the `project_api_users` table's columns -- same
// explicit-local-type approach ApiTokensService uses for
// `personal_access_tokens`, rather than depending on the generated Prisma
// model shape everywhere.
export interface ApiUserSummary {
  id: number;
  username: string;
  abilities: string[];
  createdAt: Date | null;
}

export interface IssuedApiSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  abilities: string[];
}

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function parseAbilities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

@Injectable()
export class ApiAuthUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async loadProjectById(projectId: number) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  private async loadProjectByUuid(uuid: string) {
    const project = await this.prisma.project.findFirst({ where: { uuid, deletedAt: null } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  // --- Credential management (dashboard-authenticated -- ApiAuthUsersController) ---

  async list(projectId: number): Promise<ApiUserSummary[]> {
    await this.loadProjectById(projectId);

    const rows = await this.prisma.projectApiUser.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      abilities: parseAbilities(row.abilities),
      createdAt: row.createdAt,
    }));
  }

  async create(
    projectId: number,
    username: string,
    password: string,
    abilities: string[],
  ): Promise<ApiUserSummary> {
    await this.loadProjectById(projectId);

    const trimmedUsername = username?.trim();
    if (!trimmedUsername) throw new ForbiddenException('A username is required');
    if (!password || password.length < 8) {
      throw new ForbiddenException('A password of at least 8 characters is required');
    }

    const existing = await this.prisma.projectApiUser.findUnique({
      where: { projectId_username: { projectId, username: trimmedUsername } },
    });
    if (existing) throw new ConflictException('That username is already in use on this project');

    // Same footgun-guard ApiTokensService.issue() applies to a static
    // key's abilities: an empty selection defaults to full access rather
    // than silently minting a credential that can do nothing.
    const normalizedAbilities = abilities?.length ? abilities : ['*'];
    const passwordHash = await bcrypt.hash(password, 10);

    const row = await this.prisma.projectApiUser.create({
      data: {
        projectId,
        username: trimmedUsername,
        passwordHash,
        abilities: JSON.stringify(normalizedAbilities),
      },
    });

    return {
      id: row.id,
      username: row.username,
      abilities: normalizedAbilities,
      createdAt: row.createdAt,
    };
  }

  async remove(projectId: number, apiUserId: number): Promise<void> {
    await this.loadProjectById(projectId);

    const row = await this.prisma.projectApiUser.findFirst({
      where: { id: apiUserId, projectId },
    });
    if (!row) throw new NotFoundException(`API user ${apiUserId} not found for this project`);

    // project_api_refresh_tokens.api_user_id is ON DELETE CASCADE (see
    // docker/mysql/add-public-api-auth-schema.sql) -- every outstanding
    // refresh token for this credential is removed by MySQL itself.
    await this.prisma.projectApiUser.delete({ where: { id: apiUserId } });
  }

  // --- Login / refresh (public, unauthenticated -- ProjectApiAuthController) ---

  async login(projectUuid: string, username: string, password: string): Promise<IssuedApiSession> {
    const project = await this.loadProjectByUuid(projectUuid);

    const row = await this.prisma.projectApiUser.findUnique({
      where: { projectId_username: { projectId: project.id, username } },
    });
    if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
      throw new UnauthorizedException({ error: 'Invalid username or password' });
    }

    return this.issueSession(project.id, row);
  }

  async refresh(projectUuid: string, refreshToken: string): Promise<IssuedApiSession> {
    const project = await this.loadProjectByUuid(projectUuid);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.prisma.projectApiRefreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ error: 'Invalid or expired refresh token' });
    }

    const row = await this.prisma.projectApiUser.findUnique({ where: { id: stored.apiUserId } });
    if (!row || row.projectId !== project.id) {
      throw new UnauthorizedException({ error: 'Invalid or expired refresh token' });
    }

    // Rotate on every use: the presented refresh token is single-use --
    // revoking it here means a stolen-and-replayed refresh token stops
    // working the moment the legitimate client refreshes first.
    await this.prisma.projectApiRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(project.id, row);
  }

  private async issueSession(
    projectId: number,
    apiUser: { id: number; abilities: string | null },
  ): Promise<IssuedApiSession> {
    const abilities = parseAbilities(apiUser.abilities);

    const accessToken = await this.jwtService.signAsync(
      { typ: 'public-api-access', projectId, apiUserId: apiUser.id, abilities },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );

    const refreshSecret = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshSecret).digest('hex');
    await this.prisma.projectApiRefreshToken.create({
      data: {
        apiUserId: apiUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken: refreshSecret,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      abilities,
    };
  }
}
