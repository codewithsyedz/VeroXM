import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { V2TokenGuard } from '../v2-token.guard.js';
import { RateLimitGuard } from '../rate-limit.guard.js';
import { RequireAbility } from '../require-ability.decorator.js';
import { PublicContentService, type ListOptions } from '../public-content.service.js';
import { PublicContentWriteService } from '../public-content-write.service.js';

interface TokenRequest {
  projectToken: { project: { id: number; uuid: string; defaultLocale: string } };
}

// The redesigned v2 public API. Same underlying data and field-shaping
// rules as the v1 shim (both go through PublicContentService /
// PublicContentWriteService) — what's different is the route shape and
// how filters travel: a plain GET for the common case, and a POST
// `/content/search` for the where[]/whereRelation/sort DSL, since that's
// far easier for a client to construct correctly as a JSON body than as
// bracketed query-string params. See docs/PHASE-5-NOTES.md.
@UseGuards(V2TokenGuard, RateLimitGuard)
@Controller('public/v2/projects/:uuid/collections/:slug/content')
export class V2ContentController {
  constructor(
    private readonly contentService: PublicContentService,
    private readonly writeService: PublicContentWriteService,
  ) {}

  @Get()
  @RequireAbility('read')
  list(
    @Param('slug') slug: string,
    @Query() query: Record<string, any>,
    @Req() req: TokenRequest,
  ) {
    const options: ListOptions = {
      sort: query.sort,
      state: query.state,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      count: query.count !== undefined,
      timestamps: query.timestamps !== undefined,
      // docs/ADVANCED-USE-CASES-IMPLEMENTATION-PLAN.md §4.2.
      locale: query.locale,
    };
    return this.contentService.list(req.projectToken.project.id, slug, options);
  }

  @Post('search')
  @RequireAbility('read')
  search(
    @Param('slug') slug: string,
    @Body() body: ListOptions,
    @Req() req: TokenRequest,
  ) {
    return this.contentService.list(req.projectToken.project.id, slug, body);
  }

  @Get(':id')
  @RequireAbility('read')
  getById(
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

  @Post()
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

  @Patch(':id')
  @RequireAbility('update')
  update(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Req() req: TokenRequest,
  ) {
    return this.writeService.update(req.projectToken.project.id, slug, id, body);
  }

  @Delete(':id')
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
