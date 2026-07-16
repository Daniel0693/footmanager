import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { RosterImportService } from './roster-import.service';
import { RosterMatchingService } from './roster-matching.service';
import { RosterController } from './roster.controller';
import { RosterService } from './roster.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [RosterController],
  providers: [RosterService, RosterMatchingService, RosterImportService],
})
export class RosterModule {}
