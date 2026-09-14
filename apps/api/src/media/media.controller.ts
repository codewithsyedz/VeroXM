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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ProjectRoleGuard } from '../authz/project-role.guard.js';
import { RequireProjectRole } from '../authz/require-project-role.decorator.js';

const MAX_FILE_SIZE_BYTES = Number(process.env.MAX_FILE_SIZE_MB ?? 20) * 1024 * 1024;

// Multer 2.x no longer ships the ambient Express.Multer.File augmentation
// that @types/multer used to provide, so we declare just the fields this
// controller actually uses instead of depending on a global type.
interface UploadedFileShape {
  originalname: string;
  buffer: Buffer;
  size: number;
}

// Phase 6: project-role-scoped — matches the legacy MediaLibraryController,
// which allows super_admin, admin{project_id}, or editor{project_id} on
// every method (see docs/PHASE-6-NOTES.md).
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('projects/:projectId/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @RequireProjectRole('editor')
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: string,
    @Query('search') search?: string,
  ) {
    return this.mediaService.list(projectId, {
      page: page ? Number(page) : 1,
      search,
    });
  }

  @Post('upload')
  @RequireProjectRole('editor')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  upload(
    @Param('projectId', ParseIntPipe) projectId: number,
    @UploadedFile() file: UploadedFileShape,
    @Body('caption') caption?: string,
  ) {
    return this.mediaService.upload(projectId, file, caption);
  }

  @Patch(':id')
  @RequireProjectRole('editor')
  updateCaption(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('caption') caption: string,
  ) {
    return this.mediaService.updateCaption(projectId, id, caption);
  }

  @Delete(':id')
  @RequireProjectRole('editor')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.mediaService.remove(projectId, id);
  }
}
