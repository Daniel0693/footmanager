import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { RolesService } from './roles.service';

@Module({
  providers: [RolesService, PermissionsService],
  exports: [RolesService, PermissionsService],
})
export class RolesModule {}
