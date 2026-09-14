import { Module } from '@nestjs/common';
import { CollectionFieldsController } from './collection-fields.controller.js';
import { CollectionFieldsService } from './collection-fields.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [CollectionFieldsController],
  providers: [CollectionFieldsService],
})
export class CollectionFieldsModule {}
