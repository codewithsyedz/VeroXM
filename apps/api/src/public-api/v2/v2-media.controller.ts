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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from '../../media/media.service.js';
import { V2TokenGuard } from '../v2-token.guard.js';
import { RateLimitGuard } from '../rate-limit.guard.js';
import { RequireAbility } from '../require-ability.decorator.js';

const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_MB ?? 20) * 1024 * 1024;

// Same shape MediaController declares -- multer 2.x no longer ships the
// ambient Express.Multer.File augmentation.
interface UploadedFileShape {
  originalname: string;
  buffer: Buffer;
  size: number;
}

interface TokenRequest {
  projectToken: { project: { id: number; uuid: string; defaultLocale: string } };
}

// The public API's media surface -- same MediaService the dashboard's own
// MediaController uses (list/upload/updateCaption/remove), just reached
// with a project token's abilities instead of a dashboard session's
// project role. Reuses the read/create/update/delete abilities a token
// already carries for content, rather than inventing a media-specific
// permission -- a token's abilities describe what it can do to this
// project's public API as a whole.
@UseGuards(V2TokenGuard, RateLimitGuard)
@Controller('public/v2/projects/:uuid/media')
export class V2MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @RequireAbility('read')
  list(
    @Req() req: TokenRequest,
    @Query('page') page?: string,
    @Query('search') search?: string,
  ) {
    return this.mediaService.list(req.projectToken.project.id, {
      page: page ? Number(page) : 1,
      search,
    });
  }

  @Post('upload')
  @RequireAbility('create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  upload(
    @Req() req: TokenRequest,
    @UploadedFile() file: UploadedFileShape,
    @Body('caption') caption?: string,
  ) {
    return this.mediaService.upload(req.projectToken.project.id, file, caption);
  }

  @Patch(':id')
  @RequireAbility('update')
  updateCaption(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('caption') caption: string,
  ) {
    return this.mediaService.updateCaption(req.projectToken.project.id, id, caption);
  }

  @Delete(':id')
  @RequireAbility('delete')
  async remove(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    await this.mediaService.remove(req.projectToken.project.id, id);
    return { success: true };
  }
}
