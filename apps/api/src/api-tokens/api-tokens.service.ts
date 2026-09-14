import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { PROJECT_TOKENABLE_TYPE } from '../public-api/public-api-auth.service.js';

// Matches the `personal_access_tokens` table's columns — same
// explicit-local-type approach used elsewhere in this codebase (see
// CollectionsService) rather than depending on the generated Prisma model
// shape everywhere.
export interface ApiTokenSummary {
  id: number;
  name: string;
  abilities: string[];
  lastUsedAt: Date | null;
  createdAt: Date | null;
}

export interface IssuedApiToken extends ApiTokenSummary {
  // Only ever returned once, at issuance time — never stored in plaintext
  // and never returned again by list().
  plainTextToken: string;
}

function parseAbilities(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadProjectOrThrow(projectId: number) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    return project;
  }

  async list(projectId: number): Promise<ApiTokenSummary[]> {
    await this.loadProjectOrThrow(projectId);

    const rows = await this.prisma.personalAccessToken.findMany({
      where: { tokenableType: PROJECT_TOKENABLE_TYPE, tokenableId: projectId },
      orderBy: { createdAt: 'desc' },
    });

    type TokenRow = (typeof rows)[number];

    return rows.map((row: TokenRow) => ({
      id: row.id,
      name: row.name,
      abilities: parseAbilities(row.abilities),
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    }));
  }

  // Issues a token in exactly the format PublicApiAuthService.resolveToken()
  // already verifies ("{id}|{secret}", sha256-hex stored in `token`) — see
  // that file's own comment for why this keeps legacy-issued tokens working
  // unchanged. The secret itself doesn't need to match Sanctum's own
  // Str::random() internals — only *this* stack ever needs to mint one, so
  // any sufficiently-random source is fine; timing-safe verification is
  // what matters, and that's already handled on the read side.
  async issue(projectId: number, name: string, abilities: string[]): Promise<IssuedApiToken> {
    await this.loadProjectOrThrow(projectId);

    const trimmedName = name?.trim();
    if (!trimmedName) throw new ForbiddenException('A token name is required');

    const normalizedAbilities = abilities?.length ? abilities : ['*'];
    const secret = crypto.randomBytes(40).toString('hex');
    const hash = crypto.createHash('sha256').update(secret).digest('hex');

    const row = await this.prisma.personalAccessToken.create({
      data: {
        tokenableType: PROJECT_TOKENABLE_TYPE,
        tokenableId: projectId,
        name: trimmedName,
        token: hash,
        abilities: JSON.stringify(normalizedAbilities),
      },
    });

    return {
      id: row.id,
      name: row.name,
      abilities: normalizedAbilities,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
      plainTextToken: `${row.id}|${secret}`,
    };
  }

  async revoke(projectId: number, tokenId: number): Promise<void> {
    await this.loadProjectOrThrow(projectId);

    const row = await this.prisma.personalAccessToken.findFirst({
      where: { id: tokenId, tokenableType: PROJECT_TOKENABLE_TYPE, tokenableId: projectId },
    });
    if (!row) throw new NotFoundException(`Token ${tokenId} not found for this project`);

    await this.prisma.personalAccessToken.delete({ where: { id: tokenId } });
  }
}
