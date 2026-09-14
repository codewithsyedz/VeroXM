import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LegacyTokenGuard } from '../legacy-token.guard.js';
import { RequireAbility } from '../require-ability.decorator.js';
import { PublicContentService, type ListOptions } from '../public-content.service.js';
import { PublicContentWriteService } from '../public-content-write.service.js';

interface TokenRequest {
  projectToken: { project: { id: number; uuid: string; defaultLocale: string } };
}

// The v1 compatibility shim. Route shape matches the legacy public API
// exactly, one level down from where Laravel's RouteServiceProvider
// mounts routes/api.php (`Route::prefix('api')` — confirmed there, not
// assumed) — so the legacy's real external paths are `/api/{uuid}/{slug}`,
// `/api/{uuid}/{slug}/{id}`, etc. This controller lives at
// `/public/v1/...` internally; infra/nginx.conf.sample rewrites the
// external `/api/...` path to this prefix before proxying here, so nothing
// about the external contract changes during the strangler-fig cutover.
@UseGuards(LegacyTokenGuard)
@Controller('public/v1/:uuid')
export class V1ContentController {
  constructor(
    private readonly contentService: PublicContentService,
    private readonly writeService: PublicContentWriteService,
  ) {}

  private parseWhere(raw: unknown): unknown {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  @Get(':slug')
  @RequireAbility('read')
  async getContent(
    @Param('slug') slug: string,
    @Query() query: Record<string, any>,
    @Req() req: TokenRequest,
  ) {
    const options: ListOptions = {
      where: query.where !== undefined ? this.parseWhere(query.where) : undefined,
      whereRelation: query.whereRelation,
      sort: query.sort,
      state: query.state,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      count: query.count !== undefined,
      first: query.first !== undefined,
      timestamps: query.timestamps !== undefined,
    };
    return this.contentService.list(req.projectToken.project.id, slug, options);
  }

  @Get(':slug/:id')
  @RequireAbility('read')
  getContentByID(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, any>,
    @Req() req: TokenRequest,
  ) {
    return this.contentService.getById(
      req.projectToken.project.id,
      slug,
      id,
      query.timestamps !== undefined,
    );
  }

  @Post(':slug')
  @RequireAbility('create')
  create(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Req() req: TokenRequest,
  ) {
    return this.writeService.create(
      req.projectToken.project.id,
      req.projectToken.project.defaultLocale,
      slug,
      body,
    );
  }

  @Post(':slug/update/:id')
  @RequireAbility('update')
  update(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Req() req: TokenRequest,
  ) {
    return this.writeService.update(req.projectToken.project.id, slug, id, body);
  }

  @Delete(':slug/:id')
  @RequireAbility('delete')
  async remove(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TokenRequest,
  ) {
    await this.writeService.remove(req.projectToken.project.id, slug, id);
    return { message: 'Record deleted.' };
  }
}
