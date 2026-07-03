import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { TeamStaffController } from './team-staff.controller';
import { TeamStaffService } from './team-staff.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [TeamStaffController],
  providers: [TeamStaffService],
})
export class TeamStaffModule {}
